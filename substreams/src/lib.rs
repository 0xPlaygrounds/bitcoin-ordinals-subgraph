mod abi;
mod pb;
mod inscriptions;

use inscriptions::parse_inscriptions;
use pb::ordinals::v1 as ord;
use pb::sf::bitcoin::r#type::v1 as btc;

#[allow(unused_imports)]
use num_traits::cast::ToPrimitive;
use substreams::store::{StoreAddInt64, StoreGetInt64};
use substreams::store::{StoreAdd, StoreGet, StoreNew};

impl btc::Transaction {
    pub fn amount(&self) -> i64 {
        self.vout.iter()
            .map(|vout| btc_to_sats(vout.value))
            .sum()
    }
}


fn btc_to_sats(btc_amount: f64) -> i64 {
    let s = format!("{:.8}", btc_amount);
    s.replace(".", "").parse::<i64>().unwrap()
}

// From https://github.com/ordinals/ord/blob/master/bip.mediawiki
fn subsidy(height: i64) -> i64 {
    50 * 100_000_000 >> (height / 210_000)
}

#[substreams::handlers::store]
fn store_total_supply(block: btc::Block, store: StoreAddInt64) {
    store.add(
        block.height as u64,
        "total_supply",
        subsidy(block.height),
    );
}

#[substreams::handlers::map]
fn map_ordinals(
    block: btc::Block,
    total_supply: StoreGetInt64,
) -> Result<ord::Block, substreams::errors::Error> {
    // Total supply of sats before the block is mined
    let total_supply = if block.height == 0 {0} else {
        total_supply.get_at((block.height - 1) as u64, "total_supply")
            .expect("Total supply exists")
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
            start: first_ordinal,
            size: block_subsidy,
        }),
        input_utxos: vec![],
        relative_assignments: vec![],
        // Might not be necessary, could set to empty vec
        inscriptions: parse_inscriptions(raw_coinbase_tx.txid.clone(), hex::decode(raw_coinbase_tx.hex.clone()).expect("hex"))
    };

    // Handle non-coinbase transactions
    let mut transactions = block.tx[1..].iter().enumerate().map(|(idx, tx)| {
        ord::Transaction {
            txid: tx.txid.clone(),
            idx: idx as i64,
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
                        start: counter,
                        size: btc_to_sats(vout.value),
                    });
                    (counter + btc_to_sats(vout.value), rel_ass)
                }).1,
            inscriptions: parse_inscriptions(tx.txid.clone(), hex::decode(tx.hex.clone()).expect("hex"))
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
        .flat_map(|tx| {
            if tx.hex.contains("0063") {
                parse_inscriptions(tx.txid, hex::decode(tx.hex).expect("hex"))
            } else {
                vec![]
            }
        })
        .collect::<Vec<_>>();

    Ok(ord::Inscriptions { inscriptions })
}
