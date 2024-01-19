mod ord;
mod pb;
mod address;
mod sats_utils;

use bitcoin::{consensus::deserialize, hashes::hex::FromHex, Transaction};
use ord::envelope::ParsedEnvelope;
use address::address_from_scriptpubkey;
use pb::ordinals::v1::{self as ord_proto, Inscription};
use pb::sf::bitcoin::r#type::v1 as btc;
use anyhow::Result;

use sats_utils::{btc_to_sats, subsidy, block_supply};

impl btc::Transaction {
    pub fn amount(&self) -> u64 {
        self.vout.iter()
            .map(|vout| btc_to_sats(vout.value))
            .sum()
    }
}

#[substreams::handlers::map]
fn map_ordinals(block: btc::Block) -> Result<ord_proto::Block, substreams::errors::Error> {
    // Total supply of sats before the block is mined
    let total_supply = if block.height == 0 {0} else {
        block_supply((block.height - 1) as u64)
    };
    let block_subsidy = subsidy(block.height as u64);

    // First ordinal of the block subsidy
    let first_ordinal = total_supply;

    // Get coinbase tx
    let raw_coinbase_tx = &block.tx[0];
    let coinbase_tx = ord_proto::Transaction {
        txid: raw_coinbase_tx.txid.clone(),
        idx: 0,
        amount: raw_coinbase_tx.amount(),
        coinbase_ordinals: raw_coinbase_tx.vout.iter()
            .fold((first_ordinal, vec![]), |(counter, mut rel_ass), vout| {
                rel_ass.push(ord_proto::OrdinalBlock {
                    utxo: raw_coinbase_tx.txid.clone() + ":" + &vout.n.to_string(),
                    address: address_from_scriptpubkey(&vout.script_pub_key.as_ref().unwrap().hex),
                    start: counter,
                    size: btc_to_sats(vout.value),
                });
                (counter + btc_to_sats(vout.value), rel_ass)
            }).1,
        input_utxos: vec![],
        relative_ordinals: vec![],
        // Might not be necessary, could set to empty vec
        inscriptions: match parse_inscriptions(raw_coinbase_tx.clone()) {
            Ok(inscriptions) => inscriptions,
            Err(err) => {
                substreams::log::info!("Error parsing inscriptions in tx {}: {}", raw_coinbase_tx.txid, err);
                vec![]
            }
        }
    };

    // Handle non-coinbase transactions
    let mut transactions = block.tx[1..].iter().enumerate().map(|(idx, tx)| {
        ord_proto::Transaction {
            txid: tx.txid.clone(),
            idx: (idx + 1) as u64,
            amount: tx.amount(),
            // fee: 
            coinbase_ordinals: vec![],
            input_utxos: tx.vin.iter()
                .map(|vin| vin.txid.clone() + ":" + &vin.vout.to_string())
                .collect(),
            relative_ordinals: tx.vout.iter()
                .fold((0, vec![]), |(counter, mut rel_ass), vout| {
                    rel_ass.push(ord_proto::OrdinalBlock {
                        utxo: tx.txid.clone() + ":" + &vout.n.to_string(),
                        address: address_from_scriptpubkey(&vout.script_pub_key.as_ref().unwrap().hex),
                        start: counter,
                        size: btc_to_sats(vout.value),
                    });
                    (counter + btc_to_sats(vout.value), rel_ass)
                }).1,
            inscriptions: match parse_inscriptions(tx.clone()) {
                Ok(inscriptions) => inscriptions,
                Err(err) => {
                    substreams::log::info!("Error parsing inscriptions in tx {}: {}", tx.txid, err);
                    vec![]
                }
            }
        }
    }).collect::<Vec<_>>();

    // Block
    let mut all_txs = vec![coinbase_tx];
    all_txs.append(&mut transactions);
    let block = ord_proto::Block {
        number: block.height as u64,
        timestamp: block.time as u64,
        miner_reward: all_txs[0].amount.clone(),
        subsidy: block_subsidy as u64,
        fees: all_txs[0].amount - block_subsidy,
        txs: all_txs,
    };

    Ok(block)
}

#[substreams::handlers::map]
fn map_transaction(block: btc::Block) -> Result<btc::Transaction, substreams::errors::Error> {
    if let Some(tx) = block.tx.iter().last() {
        Ok(tx.clone())
    } else {
        panic!("No transactions in block")
    }
}

#[substreams::handlers::map]
fn map_inscriptions(block: btc::Block) -> Result<ord_proto::Inscriptions, substreams::errors::Error> {
    let inscriptions = block.tx.into_iter()
        .filter(|tx| tx.hex.contains("0063"))
        .flat_map(|tx| {
            let txid = tx.txid.clone();
            match parse_inscriptions(tx) {
                Ok(inscriptions) => inscriptions,
                Err(err) => {
                    substreams::log::info!("Error parsing inscriptions in tx {}: {}", txid, err);
                    vec![]
                }
            }
        })
        .collect::<Vec<_>>();

    Ok(ord_proto::Inscriptions { inscriptions })
}

fn parse_inscriptions(tx: btc::Transaction) -> Result<Vec<Inscription>> {
    let raw_trx = Vec::from_hex(&tx.hex).unwrap();
    let tx_: Transaction = deserialize(&raw_trx).unwrap();
    let envelopes = ParsedEnvelope::from_transaction(&tx_);
    let inscriptions = envelopes.into_iter()
        .enumerate()
        .filter_map(move |(idx, envelope)| {
        Some(Inscription {
            id: format!("{}i{}", tx.txid, idx),
            content_type: envelope.payload.content_type().map(|s| s.to_string()),
            content_length: envelope.payload.content_length().map(|s| s.to_string()).unwrap_or("0".into()),
            pointer: envelope.payload.pointer().map(|ptr| ptr as i64),
            parent: envelope.payload.parent().map(|parent| parent.to_string()),
            metadata: envelope.payload.metadata.clone().map(|metadata| match String::from_utf8(metadata.clone()) {
                Ok(metadata) => metadata,   
                Err(_) => hex::encode(metadata)
            }),
            metaprotocol: envelope.payload.metaprotocol().map(|s| s.to_string()),
            content_encoding: envelope.payload.content_encoding().map(|s| match String::from_utf8(s.as_ref().to_vec()) {
                Ok(content_type) => content_type,
                Err(_) => hex::encode(s.as_ref())
            }),
            content: match String::from_utf8(envelope.payload.body().unwrap_or_default().to_vec()) {
                Ok(content) => content,
                Err(_) => hex::encode(envelope.payload.body().unwrap_or_default())
            }
        })
    })
    .collect();

    Ok(inscriptions)
}
