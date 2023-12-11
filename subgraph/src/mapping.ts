import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import { Block } from "./pb/ordinals/v1/Block"
import { Ordinals } from './pb/ordinals/v1/Ordinals';
import { OrdinalsAssignment as ProtoOrdinalsAssignment } from './pb/ordinals/v1/OrdinalsAssignment';
import { OrdinalsTransfers as ProtoOrdinalsTransfers } from './pb/ordinals/v1/OrdinalsTransfers';
import { OrdinalsAssignment, Utxo } from '../generated/schema';
import { Protobuf } from 'as-proto/assembly';
import { Transaction } from './pb/ordinals/v1/Transaction';


// Implementing my own forEach because AssemblyScript can't figure out how to support
// closures and tuples
function forEach<S, T>(capture: S, data: Array<T>, f: (capture: S, item: T, idx: i32) => void): void {
  for (let i = 0; i < data.length; ++i) {
    f(capture, data[i], i)
  }
}

function forEach2<S1, S2, T>(capture1: S1, capture2: S2, data: Array<T>, f: (capture1: S1, capture2: S2, item: T, idx: i32) => void): void {
  for (let i = 0; i < data.length; ++i) {
    f(capture1, capture2, data[i], i)
  }
}

function forEach3<S1, S2, S3, T>(capture1: S1, capture2: S2, capture3: S3, data: Array<T>, f: (capture1: S1, capture2: S2, capture3: S3, item: T, idx: i32) => void): void {
  for (let i = 0; i < data.length; ++i) {
    f(capture1, capture2, capture3, data[i], i)
  }
}

function getAssignmentOrdinals(assignment: ProtoOrdinalsAssignment): Ordinals {
  if (assignment.ordinals) {
    return assignment.ordinals as Ordinals
  } 
  return new Ordinals("0", "0")
}

function popNOrdinals(ordinals: Array<OrdinalsAssignment>, n: BigInt): Array<OrdinalsAssignment> {
  // TODO:
  return []
}

function numOrdinals(ordinals_assignment: OrdinalsAssignment): BigInt {
  return ordinals_assignment.end.minus(ordinals_assignment.start).plus(BigInt.fromU32(1))
}

function assignOrdinals(ordinals: Array<OrdinalsAssignment>, utxos: Array<BigInt>): Array<Array<OrdinalsAssignment>> {
  let utxos_assignments = new Array<Array<OrdinalsAssignment>>(utxos.length);
  let utxo_index = 0

  ordinals.forEach((assignment) => {
    while (numOrdinals(assignment) > BigInt.zero() && utxo_index < utxos_assignments.length) {
      
    }
  })

  return utxos_assignments
}

export function handleBlock(blockBytes: Uint8Array): void {
  const block = Protobuf.decode<Block>(blockBytes, Block.decode);

  forEach(block, block.txs, (block, tx, _) => {
    // Handle new ordinals assignments
    forEach2(block, tx, tx.assigments, (block, tx, assignment, idx) => {
      let utxo = new Utxo(assignment.utxo);
      utxo.txid = tx.txid;
      utxo.unspent = true;
      utxo.save();

      let ord_assignment = new OrdinalsAssignment(utxo.id + ":0");
      ord_assignment.block = BigInt.fromU64(block.block);
      ord_assignment.start = BigInt.fromString(getAssignmentOrdinals(assignment).start);
      ord_assignment.end = BigInt.fromString(getAssignmentOrdinals(assignment).end);
      ord_assignment.idx = idx
      ord_assignment.utxo = utxo.id
      ord_assignment.save()
    })

    // Handle ordinals transfers
    let input_ordinals = new Array<OrdinalsAssignment>(0);
    let transfers = tx.transfers;
    if (transfers) {
      // Collect ordinals of all input UTXOs
      forEach(input_ordinals, transfers.inputUtxos, (input_ordinals, input_utxo, _) => {
        let utxo = Utxo.load(input_utxo);
        if (utxo != null) {
          input_ordinals = input_ordinals.concat(utxo.ordinals.load());
          utxo.unspent = false;
          utxo.save();
        }
      })
  
      // "Distribute" ordinals to all output UTXOs (FIFO)
      forEach3(block, tx, input_ordinals, transfers.relativeAssignments, (block, tx, input_ordinals, assignment, idx) => {
        let utxo = new Utxo(assignment.utxo);
        utxo.txid = tx.txid;
        utxo.unspent = true;
        utxo.save();
  
        let start = BigInt.fromString(getAssignmentOrdinals(assignment).start);
        let end = BigInt.fromString(getAssignmentOrdinals(assignment).end);
        let utxo_ordinals = popNOrdinals(input_ordinals, end - start);
        forEach2(block, utxo, utxo_ordinals, (block, utxo, utxo_assignment, idx) => {
          utxo_assignment.utxo = utxo.id;
          utxo_assignment.block = BigInt.fromU64(block.block);
          utxo_assignment.idx = idx;
          utxo_assignment.save()
        })
      })  
    }
  })
}