mod pb;
mod inscriptions;
mod address;
mod sats_utils;

use inscriptions::parse_inscriptions;
use address::address_from_scriptpubkey;
use pb::ordinals::v1 as ord;
use pb::sf::bitcoin::r#type::v1 as btc;

use sats_utils::{btc_to_sats, subsidy, block_supply};

impl btc::Transaction {
    pub fn amount(&self) -> i64 {
        self.vout.iter()
            .map(|vout| btc_to_sats(vout.value))
            .sum()
    }
}

#[substreams::handlers::map]
fn map_ordinals(block: btc::Block) -> Result<ord::Block, substreams::errors::Error> {
    // Total supply of sats before the block is mined
    let total_supply = if block.height == 0 {0} else {
        block_supply(block.height - 1)
    };
    let block_subsidy = subsidy(block.height);

    // First ordinal of the block subsidy
    let first_ordinal = total_supply;

    // Get coinbase tx
    let raw_coinbase_tx = &block.tx[0];
    let coinbase_tx = ord::Transaction {
        txid: raw_coinbase_tx.txid.clone(),
        idx: 0,
        amount: raw_coinbase_tx.amount(),
        assignment: Some(ord::OrdinalsBlockAssignment {
            utxo: raw_coinbase_tx.txid.clone() + ":0",
            address: address_from_scriptpubkey(&raw_coinbase_tx.vout[0].script_pub_key.as_ref().unwrap().hex),
            start: first_ordinal,
            size: block_subsidy,
        }),
        input_utxos: vec![],
        relative_assignments: vec![],
        // Might not be necessary, could set to empty vec
        inscriptions: match parse_inscriptions(raw_coinbase_tx.txid.clone(), hex::decode(raw_coinbase_tx.hex.clone()).expect("hex")) {
            Ok(inscriptions) => inscriptions,
            Err(err) => {
                substreams::log::info!("Error parsing inscriptions in tx {}: {}", raw_coinbase_tx.txid, err);
                vec![]
            }
        }
    };

    // Handle non-coinbase transactions
    let mut transactions = block.tx[1..].iter().enumerate().map(|(idx, tx)| {
        ord::Transaction {
            txid: tx.txid.clone(),
            idx: (idx + 1) as i64,
            amount: tx.amount(),
            // fee: 
            assignment: None,
            input_utxos: tx.vin.iter()
                .map(|vin| vin.txid.clone() + ":" + &vin.vout.to_string())
                .collect(),
            relative_assignments: tx.vout.iter()
                .fold((0, vec![]), |(counter, mut rel_ass), vout| {
                    rel_ass.push(ord::OrdinalsBlockAssignment {
                        utxo: tx.txid.clone() + ":" + &vout.n.to_string(),
                        address: address_from_scriptpubkey(&vout.script_pub_key.as_ref().unwrap().hex),
                        start: counter,
                        size: btc_to_sats(vout.value),
                    });
                    (counter + btc_to_sats(vout.value), rel_ass)
                }).1,
            inscriptions: match parse_inscriptions(tx.txid.clone(), hex::decode(tx.hex.clone()).expect("hex")) {
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
    let block = ord::Block {
        number: block.height,
        timestamp: block.time,
        miner_reward: all_txs[0].amount.clone(),
        subsidy: block_subsidy,
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
fn map_inscriptions(block: btc::Block) -> Result<ord::Inscriptions, substreams::errors::Error> {
    let inscriptions = block.tx.into_iter()
        .filter(|tx| tx.txid == "6fb976ab49dcec017f1e201e84395983204ae1a7c2abf7ced0a85d692e442799")
        .flat_map(|tx| {
            if tx.hex.contains("0063") {
                match parse_inscriptions(tx.txid.clone(), hex::decode(tx.hex).expect("hex")) {
                    Ok(inscriptions) => inscriptions,
                    Err(err) => {
                        substreams::log::info!("Error parsing inscriptions in tx {}: {}", tx.txid, err);
                        vec![]
                    }
                }
            } else {
                vec![]
            }
        })
        .collect::<Vec<_>>();

    Ok(ord::Inscriptions { inscriptions })
}
