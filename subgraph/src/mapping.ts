import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import { Block } from "./pb/ordinals/v1/Block"
import { Ordinals } from './pb/ordinals/v1/Ordinals';
import { OrdinalsAssignment as ProtoOrdinalsAssignment } from './pb/ordinals/v1/OrdinalsAssignment';
import { OrdinalsTransfers as ProtoOrdinalsTransfers } from './pb/ordinals/v1/OrdinalsTransfers';
import { Block as BlockEntity, OrdinalsAssignment, Utxo } from '../generated/schema';
import { Protobuf } from 'as-proto/assembly';
import { Transaction } from './pb/ordinals/v1/Transaction';
import { OrdinalsBlockAssignment } from './pb/ordinals/v1/OrdinalsBlockAssignment';


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

function popNOrdinals(
  utxo_id: string,
  idx: i32,
  input_ordinals: OrdinalsAssignment,
  rel_output_ordinals: OrdinalsBlockAssignment
): OrdinalsAssignment {
  let num_assigned = (BigInt.fromI64(rel_output_ordinals.size) <= input_ordinals.size ? BigInt.fromI64(rel_output_ordinals.size) : input_ordinals.size)
  
  // Create new block assignment
  let ord = new OrdinalsAssignment(utxo_id + idx.toString())
  ord.start = input_ordinals.start
  ord.size = num_assigned
  ord.idx = idx
  ord.utxo = utxo_id

  // Edit input block assignment
  input_ordinals.start = input_ordinals.start.plus(num_assigned)
  input_ordinals.size = input_ordinals.size.minus(num_assigned)

  // Edit relative input block assignment
  // TODO: Make this less convoluted
  rel_output_ordinals.size = BigInt.fromI64(rel_output_ordinals.size)
    .minus(num_assigned)
    .toI64()

  return ord
}

// function assignOrdinals(
//   input_utxos_ordinals: Array<OrdinalsAssignment>, 
//   rel_output_utxos_ordinals: Array<ProtoOrdinalsAssignment>,
// ): Array<OrdinalsAssignment> {
//   let rev_input_ordinals = input_utxos_ordinals.reverse()
//   let utxos_ordinals = new Array<OrdinalsAssignment>()
    
//   let rel_output_ordinals = <ProtoOrdinalsAssignment>rel_output_utxos_ordinals.pop()
//   let input_ordinals = <OrdinalsAssignment>rev_input_ordinals.pop()
//   let utxo_id = rel_output_ordinals.utxo
//   let utxo_ordinals_indx = 0
  
//   while (rel_output_utxos_ordinals.length > 0) {
//     if (utxo_id != rel_output_ordinals.utxo) {
//       utxo_ordinals_indx = 0
//       // sats_to_go = numOrdinals(rel_output_ordinals)
//       utxo_id = rel_output_ordinals.utxo
//     }

//     let output_ordinals = popNOrdinals(
//       utxo_id,
//       utxo_ordinals_indx,
//       input_ordinals, 
//       <OrdinalsBlockAssignment>rel_output_ordinals.ordinals
// )
//     utxo_ordinals_indx = utxo_ordinals_indx + 1

//     if (input_ordinals.size == BigInt.zero()) {
//       input_ordinals = <OrdinalsAssignment>rev_input_ordinals.pop()
//     }
//     if ((<Ordinals>rel_output_ordinals.ordinals).size == BigInt.zero().toString()) {
//       rel_output_ordinals = <ProtoOrdinalsAssignment>rel_output_utxos_ordinals.pop()
//       utxos_ordinals.push(output_ordinals)
//     }
//   }
  
//   return utxos_ordinals
// }

export function handleBlock(blockBytes: Uint8Array): void {
  const block = Protobuf.decode<Block>(blockBytes, Block.decode);

  // Create block
  let block_ = new BlockEntity(block.number.toString())
  block_.save()

  let coinbase_ordinals = new Array<OrdinalsAssignment>(0);
  // Handle coinbase ordinals assignments
  let coinbase_tx = block.txs[0]
  let coinbase_utxo = new Utxo((<OrdinalsBlockAssignment>coinbase_tx.assignment).utxo);
  coinbase_utxo.txid = coinbase_tx.txid;
  coinbase_utxo.unspent = true;
  coinbase_utxo.save();

  let ord_assignment = new OrdinalsAssignment(coinbase_utxo.id + ":0");
  // ord_assignment.block = BigInt.fromI64(block.number);
  ord_assignment.start = BigInt.fromI64((<OrdinalsBlockAssignment>coinbase_tx.assignment).start);
  ord_assignment.size = BigInt.fromI64((<OrdinalsBlockAssignment>coinbase_tx.assignment).size);
  ord_assignment.idx = 0
  ord_assignment.utxo = coinbase_utxo.id
  ord_assignment.save()
  coinbase_ordinals.push(ord_assignment)

  // Handle ordinals transfers for non-coinbase transactions
  for (let i = 1; i < block.txs.length; ++i) {
    let tx = block.txs[i];

    // Collect ordinals of all input UTXOs
    let input_ordinals = new Array<OrdinalsAssignment>(0);
    forEach(input_ordinals, tx.inputUtxos, (input_ordinals, input_utxo, _) => {
      let utxo = Utxo.load(input_utxo)
      if (utxo != null) {
        // Load the input UTXO's ordinals and make sure they are ordered
        let utxo_ordinals = utxo.ordinals.load()
        utxo_ordinals.sort((a, b) => a.idx - b.idx)

        input_ordinals = input_ordinals.concat(utxo_ordinals)

        // Mark the UTXO as spent
        utxo.unspent = false
        utxo.save()
      }
    })

    // Reverse order for FIFO
    input_ordinals.reverse()

    // let output_ordinals = new Array<OrdinalsAssignment>(0);
    let current_input_ordinals = <OrdinalsAssignment>input_ordinals.pop()
    
    for (let j = 0; j < tx.relativeAssignments.length; ++j) {      
      let rel_assignment = tx.relativeAssignments[j]
      let counter = 0

      // Create UTXO
      let utxo = Utxo.load(rel_assignment.utxo)
      if (utxo == null) {
        utxo = new Utxo(rel_assignment.utxo)
        utxo.txid = tx.txid
        utxo.block = block.number.toString()
        utxo.sats = BigInt.zero() // TODO:
        utxo.unspent = true
        utxo.save()
      }


      while (rel_assignment.size > 0) {
        if (current_input_ordinals.size == BigInt.zero()) {
          // Safe since there should always be more input ordinals than
          // assigned ordinals in a transaction
          current_input_ordinals = <OrdinalsAssignment>input_ordinals.pop()
        }
        
        let assignment = popNOrdinals(
          rel_assignment.utxo,
          counter,
          current_input_ordinals,
          rel_assignment
        )

        assignment.save()
      }
    }
    
    // Assign remaining input ordinals to coinbase
    if (current_input_ordinals.size > BigInt.zero()) {
      // Add back last input if not completely assigned 
      input_ordinals.push(current_input_ordinals)
    }
    while (input_ordinals.length > 0) {
      let current_input_ordinals = <OrdinalsAssignment>input_ordinals.pop()

      let assignment = new OrdinalsAssignment(coinbase_utxo.id + ":" + coinbase_ordinals.length.toString())
      assignment.start = current_input_ordinals.start
      assignment.size = current_input_ordinals.size
      assignment.idx = coinbase_ordinals.length
      assignment.utxo = coinbase_utxo.id
      assignment.save()

      coinbase_ordinals.push(assignment)
    }
  }
}