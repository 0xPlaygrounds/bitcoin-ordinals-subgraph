import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import { Block } from "./pb/ordinals/v1/Block"
import { Ordinals } from './pb/ordinals/v1/Ordinals';
import { OrdinalsAssignment as ProtoOrdinalsAssignment } from './pb/ordinals/v1/OrdinalsAssignment';
import { OrdinalsTransfers as ProtoOrdinalsTransfers } from './pb/ordinals/v1/OrdinalsTransfers';
import { Block as BlockEntity, Inscription, OrdinalsAssignment, Utxo } from '../generated/schema';
import { Protobuf } from 'as-proto/assembly';
import { Transaction } from './pb/ordinals/v1/Transaction';
import { OrdinalsBlockAssignment } from './pb/ordinals/v1/OrdinalsBlockAssignment';


// Creates a new concrete OrdinalsAssignment from the relative assignment
// `rel_output_ordinals`. The ordinals are taken from the `input_ordinals` 
// assignment, which contains a continuous block of ordinals assigned to the
// input UTXO. 
function popNOrdinals(
  idx: i32,
  input_ordinals: OrdinalsAssignment,
  rel_output_ordinals: OrdinalsBlockAssignment
): OrdinalsAssignment {
  let num_assigned = (
    BigInt.fromI64(rel_output_ordinals.size) <= input_ordinals.size 
    ? BigInt.fromI64(rel_output_ordinals.size) 
    : input_ordinals.size
  )
  
  // Create new block assignment
  let ord = new OrdinalsAssignment(rel_output_ordinals.utxo + ":" + idx.toString())
  ord.start = input_ordinals.start
  ord.size = num_assigned
  ord.idx = idx
  ord.block = input_ordinals.block
  ord.utxo = rel_output_ordinals.utxo

  // Reassign inscriptions
  let inscriptions = input_ordinals.inscriptions.load()
  for (let i = 0; i < inscriptions.length; ++i) {
    inscriptions[i].ordinals = ord.id
    inscriptions[i].save()
  }

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

export function handleBlock(blockBytes: Uint8Array): void {
  const block = Protobuf.decode<Block>(blockBytes, Block.decode);
  log.info("Processing block {}", [block.number.toString()])

  // Create block
  let block_ = new BlockEntity(block.number.toString())
  block_.save()

  let coinbase_ordinals = new Array<OrdinalsAssignment>(0);
  // Handle coinbase ordinals assignments
  let coinbase_tx = block.txs[0]
  let coinbase_utxo = new Utxo((<OrdinalsBlockAssignment>coinbase_tx.assignment).utxo);
  coinbase_utxo.txid = coinbase_tx.txid;
  coinbase_utxo.amount = BigInt.fromI64((<OrdinalsBlockAssignment>coinbase_tx.assignment).size);
  coinbase_utxo.unspent = true;
  coinbase_utxo.block = block_.id;
  coinbase_utxo.save();

  let ord_assignment = new OrdinalsAssignment(coinbase_utxo.id + ":0");
  ord_assignment.block = block_.id;
  ord_assignment.start = BigInt.fromI64((<OrdinalsBlockAssignment>coinbase_tx.assignment).start);
  ord_assignment.size = BigInt.fromI64((<OrdinalsBlockAssignment>coinbase_tx.assignment).size);
  ord_assignment.idx = 0
  ord_assignment.utxo = coinbase_utxo.id
  ord_assignment.save()
  coinbase_ordinals.push(ord_assignment)

  // Handle ordinals transfers for non-coinbase transactions
  for (let i = 1; i < block.txs.length; ++i) {
    let tx = block.txs[i];
    // log.info("Processing transaction {}", [tx.txid])

    // Collect ordinals of all input UTXOs
    let input_ordinals = new Array<OrdinalsAssignment>(0);
    for (let vin = 0; vin < tx.inputUtxos.length; ++vin) {
      let input_utxo = tx.inputUtxos[vin]
      let utxo = Utxo.load(input_utxo)
      if (utxo == null) {
        log.critical("Error: UTXO {} does not exist!", [input_utxo]);
        return
      }
      // Load the input UTXO's ordinals and make sure they are ordered
      let utxo_ordinals = utxo.ordinals.load()
      utxo_ordinals.sort((a, b) => a.idx - b.idx)

      input_ordinals = input_ordinals.concat(utxo_ordinals)

      // Mark the UTXO as spent
      utxo.unspent = false
      utxo.spent_in = block_.id
      utxo.save()
    }

    // Handle inscriptions
    for (let insc = 0; insc < tx.inscriptions.length; ++insc) {
      let inscription = new Inscription(tx.inscriptions[insc].id)
      inscription.content_type = tx.inscriptions[insc].contentType
      // inscription.pointer = BigInt.fromI64(tx.inscriptions[insc].pointer)
      inscription.parent = tx.inscriptions[insc].parent
      inscription.metadata = tx.inscriptions[insc].metadata
      inscription.metaprotocol = tx.inscriptions[insc].metaprotocol
      inscription.content_encoding = tx.inscriptions[insc].contentEncoding
      inscription.content = tx.inscriptions[insc].content
      inscription.ordinals = input_ordinals[0].id
      inscription.ordinal = input_ordinals[0].start.plus(BigInt.fromI64(tx.inscriptions[insc].pointer))
      inscription.save()
    }

    // Reverse order for FIFO
    input_ordinals.reverse()

    let current_input_ordinals = <OrdinalsAssignment>input_ordinals.pop()
    
    for (let j = 0; j < tx.relativeAssignments.length; ++j) {      
      let rel_assignment = tx.relativeAssignments[j]
      let counter = 0

      // Create UTXO
      let utxo = Utxo.load(rel_assignment.utxo)
      if (utxo == null) {
        utxo = new Utxo(rel_assignment.utxo)
        utxo.txid = tx.txid
        utxo.amount = BigInt.fromI64(rel_assignment.size)
        utxo.unspent = true
        utxo.block = block.number.toString()
        utxo.save()
      }

      while (rel_assignment.size > 0) {
        if (current_input_ordinals.size == BigInt.zero()) {
          // Safe since there should always be more input ordinals than
          // assigned ordinals in a transaction
          current_input_ordinals = <OrdinalsAssignment>input_ordinals.pop()
        }
        
        let assignment = popNOrdinals(
          counter,
          current_input_ordinals,
          rel_assignment
        )
        counter += 1

        assignment.save()
      }
    }
    
    if (current_input_ordinals.size > BigInt.zero()) {
      // Add back last input if not completely assigned 
      input_ordinals.push(current_input_ordinals)
    }
    // Assign remaining input ordinals to coinbase
    while (input_ordinals.length > 0) {
      let current_input_ordinals = <OrdinalsAssignment>input_ordinals.pop()

      let assignment = new OrdinalsAssignment(coinbase_utxo.id + ":" + coinbase_ordinals.length.toString())
      assignment.start = current_input_ordinals.start
      assignment.size = current_input_ordinals.size
      assignment.idx = coinbase_ordinals.length
      assignment.utxo = coinbase_utxo.id
      assignment.block = current_input_ordinals.block
      assignment.save()

      coinbase_ordinals.push(assignment)
    }
  }
}