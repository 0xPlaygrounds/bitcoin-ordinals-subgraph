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

function popNOrdinals(
  utxo_id: string,
  idx: i32,
  input_ordinals: OrdinalsAssignment,
  rel_output_ordinals: Ordinals): OrdinalsAssignment {
  let num_assigned = (BigInt.fromString(rel_output_ordinals.size) <= input_ordinals.size ? BigInt.fromString(rel_output_ordinals.size) : input_ordinals.size)
  
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
  rel_output_ordinals.size = BigInt.fromString(rel_output_ordinals.size)
    .minus(num_assigned)
    .toString()

  return ord
}

function assignOrdinals(
  input_utxos_ordinals: Array<OrdinalsAssignment>, 
  rel_output_utxos_ordinals: Array<ProtoOrdinalsAssignment>,
): Array<OrdinalsAssignment> {
  let rev_input_ordinals = input_utxos_ordinals.reverse()
  let utxos_ordinals = new Array<OrdinalsAssignment>()
    
  let rel_output_ordinals = <ProtoOrdinalsAssignment>rel_output_utxos_ordinals.pop()
  let input_ordinals = <OrdinalsAssignment>rev_input_ordinals.pop()
  let utxo_id = rel_output_ordinals.utxo
  let utxo_ordinals_indx = 0
  
  while (rel_output_utxos_ordinals.length > 0) {
    if (utxo_id != rel_output_ordinals.utxo) {
      utxo_ordinals_indx = 0
      // sats_to_go = numOrdinals(rel_output_ordinals)
      utxo_id = rel_output_ordinals.utxo
    }

    let output_ordinals = popNOrdinals(utxo_id, utxo_ordinals_indx, input_ordinals, <Ordinals>rel_output_ordinals.ordinals)
    utxo_ordinals_indx = utxo_ordinals_indx + 1

    if (input_ordinals.size == BigInt.zero()) {
      input_ordinals = <OrdinalsAssignment>rev_input_ordinals.pop()
    }
    if ((<Ordinals>rel_output_ordinals.ordinals).size == BigInt.zero().toString()) {
      rel_output_ordinals = <ProtoOrdinalsAssignment>rel_output_utxos_ordinals.pop()
      utxos_ordinals.push(output_ordinals)
    }
  }
  
  return utxos_ordinals
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
      ord_assignment.start = BigInt.fromString((<Ordinals>assignment.ordinals).start);
      ord_assignment.size = BigInt.fromString((<Ordinals>assignment.ordinals).size);
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
      let new_block_assignments = assignOrdinals(
        input_ordinals,
        transfers.relativeAssignments,
      );

      let utxos = new Map<string, Utxo>();

      forEach3(block, tx, utxos, new_block_assignments, (block, tx, utxos, block_assignment, _) => {
        // update or create UTXO
        let utxo = utxos.has(block_assignment.utxo) ? utxos.get(block_assignment.utxo) : null
        if (!utxo) {
          utxo = new Utxo(block_assignment.utxo)
        }

        utxo.block = block.block.toString()
        utxo.txid = tx.txid
        utxo.sats = BigInt.fromString(tx.amount)
        utxo.unspent = true

        // Edit and save block assignment
        block_assignment.block = BigInt.fromString(block.block)
        block_assignment.save()
      })

      // Save UTXOs
      utxos.forEach((utxo, _, __) => {
        utxo.save()
      })
    }
  })
}