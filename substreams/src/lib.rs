mod abi;
mod pb;
mod models;
use models::{OrdinalsRange, OrdinalsTransfer};
// use hex_literal::hex;
// use pb::contract::v1 as contract;
use pb::{ordinals::v1 as ord, sf::bitcoin::r#type::v1::ScriptPubKey};
// use substreams::Hex;
// use substreams_database_change::pb::database::DatabaseChanges;
// use substreams_ethereum::pb::eth::v2 as eth;
// use substreams_ethereum::Event;
use pb::sf::bitcoin::r#type::v1 as btc;

#[allow(unused_imports)]
use num_traits::cast::ToPrimitive;
use substreams::{
    scalar::BigInt,
    store::{StoreAdd, StoreAddBigInt, StoreGet, StoreGetBigInt, StoreNew},
};

impl ScriptPubKey {
    pub fn address(&self) -> String {
        if !self.address.is_empty() {
            self.address.clone()
        } else {
            if let Some(address) = self.addresses.first() {
                if !address.is_empty() {
                    address.clone()
                } else {
                    "UNKNOWN".into()
                }
            } else {
                "UNKNOWN".into()
            }
        }
    }
}

// From https://github.com/ordinals/ord/blob/master/bip.mediawiki
fn subsidy(height: u64) -> u64 {
    // let sats_subsidy: u64 = 50 * 100_000_000 >> (height / 210_000);
    // (sats_subsidy as f64) / (10_u64.pow(8) as f64)
    50 * 100_000_000 >> (height / 210_000)
}

#[substreams::handlers::store]
fn store_total_supply(block: btc::Block, store: StoreAddBigInt) {
    store.add(
        block.height as u64,
        "total_supply",
        &BigInt::from(subsidy(block.height as u64)),
    );
}

#[substreams::handlers::map]
fn map_ordinals(
    block: btc::Block,
    total_supply: StoreGetBigInt,
) -> Result<ord::Block, substreams::errors::Error> {
    if let Some(total_supply) = if block.height == 0 {
        Some(BigInt::zero())
    } else {
        total_supply.get_at((block.height - 1) as u64, "total_supply")
    } {
        let first_ordinal = total_supply;
        let last_ordinal = first_ordinal.clone() + BigInt::from(subsidy(block.height as u64));

        let mut coinbase_ordinals = OrdinalsRange {
            start: first_ordinal,
            end: last_ordinal,
        };

        // Handle regular transactions
        let mut transactions = block.tx[1..].iter().enumerate().map(|(idx, tx)| {
            let mut transfers = ord::OrdinalsTransfers {
                input_utxos: vec![],
                relative_assignments: vec![],
            };
            // let mut ordinals: Vec<(String, OrdinalsRange)> = vec![];

            tx.vin.iter().for_each(|input| {
                transfers.input_utxos.push(
                    input.txid.clone() + ":" + &input.vout.to_string()
                )
            });

            let mut counter = BigInt::zero();
            tx.vout.iter().for_each(|out| {
                let sats_consumed = (out.value * 10_u64.pow(8) as f64) as u64;
                transfers.relative_assignments.push(ord::OrdinalsAssignment {
                    utxo: tx.txid.clone() + ":" + &out.n.to_string(),
                    ordinals: Some(ord::Ordinals {
                        start: counter.clone().into(),
                        end: (BigInt::from(sats_consumed) +counter.clone()).into()
                    })
                });
                counter = counter.clone() + BigInt::from(sats_consumed);
            });

            ord::Transaction {
                txid: tx.txid.clone(),
                idx: (idx as u64) + 1,
                transfers: Some(transfers),
                assigments: vec![],
            }
        }).collect::<Vec<_>>();

        // Handle coinbase transaction
        let coinbase_tx = if let Some(tx) = block.tx.first() {
            let assignments = tx
                .vout
                .iter()
                .map(|out| {
                    let sats_consumed = (out.value * 10_u64.pow(8) as f64) as u64;
                    let ord_range = coinbase_ordinals.consume(BigInt::from(sats_consumed));
                    ord::OrdinalsAssignment {
                        utxo: tx.txid.clone() + ":" + &out.n.to_string(),
                        ordinals: Some(ord_range.into()),
                    }
                })
                .collect::<Vec<_>>();

            ord::Transaction {
                txid: tx.txid.clone(),
                idx: 0,
                assigments: assignments,
                transfers: None,
            }
        } else {
            panic!("No transactions in block")
        };

        // TODO: Handle leftover ordinals for miner fee

        let mut all_txs = vec![coinbase_tx];
        all_txs.append(&mut transactions);

        Ok(ord::Block {
            block: block.height as u64,
            timestamp: block.time as u64,
            txs: all_txs
        })
    } else {
        panic!("No BTC total supply")
    }
}

#[substreams::handlers::map]
fn map_transaction(block: btc::Block) -> Result<btc::Transaction, substreams::errors::Error> {
    if let Some(tx) = block.tx.get(2) {
        Ok(tx.clone())
    } else {
        panic!("No transactions in block")
    }
}

// #[substreams::handlers::map]
// fn db_out(events: contract::Events) -> Result<DatabaseChanges, substreams::errors::Error> {
//     // Initialize Database Changes container
//     let mut tables = substreams_database_change::tables::Tables::new();

//     // Loop over all the abis events to create database changes
//     events.approvals.into_iter().for_each(|evt| {
//         tables
//             .create_row("approvals", format!("{}-{}", evt.evt_tx_hash, evt.evt_index))
//             .set("evt_tx_hash", evt.evt_tx_hash)
//             .set("evt_index", evt.evt_index)
//             .set("evt_block_time", evt.evt_block_time.unwrap())
//             .set("evt_block_number", evt.evt_block_number)
//             .set("approved", Hex(&evt.approved).to_string())
//             .set("owner", Hex(&evt.owner).to_string())
//             .set("token_id", evt.token_id.to_string());
//     });
//     events.approval_for_alls.into_iter().for_each(|evt| {
//         tables
//             .create_row("approval_for_alls", format!("{}-{}", evt.evt_tx_hash, evt.evt_index))
//             .set("evt_tx_hash", evt.evt_tx_hash)
//             .set("evt_index", evt.evt_index)
//             .set("evt_block_time", evt.evt_block_time.unwrap())
//             .set("evt_block_number", evt.evt_block_number)
//             .set("approved", evt.approved)
//             .set("operator", Hex(&evt.operator).to_string())
//             .set("owner", Hex(&evt.owner).to_string());
//     });
//     events.ownership_transferreds.into_iter().for_each(|evt| {
//         tables
//             .create_row("ownership_transferreds", format!("{}-{}", evt.evt_tx_hash, evt.evt_index))
//             .set("evt_tx_hash", evt.evt_tx_hash)
//             .set("evt_index", evt.evt_index)
//             .set("evt_block_time", evt.evt_block_time.unwrap())
//             .set("evt_block_number", evt.evt_block_number)
//             .set("new_owner", Hex(&evt.new_owner).to_string())
//             .set("previous_owner", Hex(&evt.previous_owner).to_string());
//     });
//     events.transfers.into_iter().for_each(|evt| {
//         tables
//             .create_row("transfers", format!("{}-{}", evt.evt_tx_hash, evt.evt_index))
//             .set("evt_tx_hash", evt.evt_tx_hash)
//             .set("evt_index", evt.evt_index)
//             .set("evt_block_time", evt.evt_block_time.unwrap())
//             .set("evt_block_number", evt.evt_block_number)
//             .set("from", Hex(&evt.from).to_string())
//             .set("to", Hex(&evt.to).to_string())
//             .set("token_id", evt.token_id.to_string());
//     });

//     Ok(tables.to_database_changes())
// }
