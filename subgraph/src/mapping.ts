import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';
import { Block as ProtoBlock } from "./pb/ordinals/v1/Block"
import { Ordinals } from './pb/ordinals/v1/Ordinals';
import { OrdinalsAssignment as ProtoOrdinalsAssignment } from './pb/ordinals/v1/OrdinalsAssignment';
import { OrdinalsTransfers as ProtoOrdinalsTransfers } from './pb/ordinals/v1/OrdinalsTransfers';
import { Block, Inscription, Transaction, Utxo, UtxoLoader } from '../generated/schema';
import { Protobuf } from 'as-proto/assembly';
import { Transaction as ProtoTransaction } from './pb/ordinals/v1/Transaction';
import { OrdinalsBlockAssignment } from './pb/ordinals/v1/OrdinalsBlockAssignment';
import { OrdinalBlock, OrdinalSet } from './ordinals'

export function handleBlock(blockBytes: Uint8Array): void {
  const block = Protobuf.decode<ProtoBlock>(blockBytes, ProtoBlock.decode);
  log.info("Processing block {}", [block.number.toString()])

  // Create block
  let block_ = new Block(block.number.toString())
  block_.height = BigInt.fromI64(block.number)
  block_.timestamp = BigInt.fromI64(block.timestamp)
  block_.reward = BigInt.fromI64(block.minerReward)
  block_.subsidy = BigInt.fromI64(block.subsidy)
  block_.fees = BigInt.fromI64(block.fees)
  block_.save()

  let fees_ordinals = new OrdinalSet([]);
  for (let i = 1; i < block.txs.length; ++i) {
    fees_ordinals.append_set(handleRegularTransaction(block_, block.txs[i]))
  }

  handleCoinbaseTransaction(block_, block.txs[0], fees_ordinals)
}

function loadUTXOs(ids: string[]): Utxo[] {
  let utxos: Utxo[] = []

  for (let i = 0; i < ids.length; ++i) {
    let utxo = Utxo.load(ids[i])
    if (utxo == null) {
      log.critical("Error: UTXO {} does not exist!", [ids[i]]);
      return []
    }
    utxos.push(utxo)
  }

  return utxos
}

function loadInscriptions(utxos: Utxo[]): Inscription[] {
  let inscriptions: Inscription[] = []

  for (let i = 0; i < utxos.length; ++i) {
    inscriptions = inscriptions.concat(utxos[i].inscriptions.load())
  }

  return inscriptions
}

function getNthSatUtxo(utxos: Utxo[], n: i64): Utxo {
  let total: i64 = 0
  let idx = 0;
  while (total < n) {
    total += utxos[idx].amount.toI64()
    idx += 1
  }

  return utxos[idx - 1]
}

function handleRegularTransaction(block: Block, transaction: ProtoTransaction): OrdinalSet {
  log.debug("Processing regular transaction {}", [transaction.txid])

  // Load input UTXOs and ordinals
  log.debug("Loading input UTXOs", [])
  let input_utxos = loadUTXOs(transaction.inputUtxos)
  let input_ordinals: OrdinalSet = new OrdinalSet([])
  for (let i = 0; i < input_utxos.length; ++i) {
    let blocks = OrdinalSet.deserialize(input_utxos[i].ordinalsSlug)
    input_ordinals.append_set(blocks)

    // Mark UTXO as spent
    input_utxos[i].unspent = false
    input_utxos[i].spentIn = transaction.txid
    input_utxos[i].save()
  }

  // Handle inscriptions
  log.debug("Loading inscriptions", [])
  let inscriptions: Inscription[] = loadInscriptions(input_utxos)
  for (let insc = 0; insc < transaction.inscriptions.length; ++insc) {
    let inscription = new Inscription(transaction.inscriptions[insc].id)
    inscription.content_type = transaction.inscriptions[insc].contentType
    inscription.offset = BigInt.fromI64(transaction.inscriptions[insc].pointer)
    inscription.parent = transaction.inscriptions[insc].parent
    inscription.metadata = transaction.inscriptions[insc].metadata
    inscription.metaprotocol = transaction.inscriptions[insc].metaprotocol
    inscription.contentEncoding = transaction.inscriptions[insc].contentEncoding
    inscription.content = transaction.inscriptions[insc].content
    inscription.genesisTransaction = transaction.txid
    inscription.genesisAddress = transaction.relativeAssignments[0].address
    inscription.ordinal = input_ordinals.getNthOrdinal(transaction.inscriptions[insc].pointer)
    inscription.genesisUtxo = getNthSatUtxo(input_utxos, transaction.inscriptions[insc].pointer).id
    inscriptions.push(inscription)
  }

  // Assign ordinals to output UTXOs
  log.debug("Assigning ordinals to output UTXOs", [])
  for (let i = 0; i < transaction.relativeAssignments.length; ++i) {
    let utxo = new Utxo(transaction.relativeAssignments[i].utxo)
    utxo.address = transaction.relativeAssignments[i].address
    utxo.amount = BigInt.fromI64(transaction.relativeAssignments[i].size)
    utxo.unspent = true
    utxo.transaction = transaction.txid
    
    let utxo_ordinals = input_ordinals.popNOrdinals(transaction.relativeAssignments[i].size)
    // Assign inscriptions to UTXO
    for(let j = 0; j < inscriptions.length; ++j) {
      if (utxo_ordinals.contains(inscriptions[j].ordinal)) {
        inscriptions[j].location = utxo.id
        inscriptions[j].locationOffset = utxo_ordinals.offsetOf(inscriptions[j].ordinal)
        inscriptions[j].save()
      }
    }
    utxo.ordinalsSlug = utxo_ordinals.serialize()
    utxo.save()
  }

  // Create transaction
  let transaction_ = new Transaction(transaction.txid)
  transaction_.idx = BigInt.fromI64(transaction.idx)
  transaction_.amount = BigInt.fromI64(transaction.amount)
  transaction_.fee = BigInt.zero()
  transaction_.block = block.id
  transaction_.save()

  return input_ordinals
}

function handleCoinbaseTransaction(
  block: Block,
  transaction: ProtoTransaction,
  fees_ordinals: OrdinalSet,
): void {
  let coinbase_ordinals: OrdinalSet = new OrdinalSet([]);
  coinbase_ordinals.append_block(new OrdinalBlock(
    BigInt.fromI64((<OrdinalsBlockAssignment>transaction.assignment).start),
    BigInt.fromI64((<OrdinalsBlockAssignment>transaction.assignment).size)
  ))
  coinbase_ordinals.append_set(fees_ordinals)

  let utxo = new Utxo((<OrdinalsBlockAssignment>transaction.assignment).utxo)
  utxo.amount = BigInt.fromI64((<OrdinalsBlockAssignment>transaction.assignment).size)
  utxo.unspent = true
  utxo.transaction = transaction.txid
  utxo.ordinalsSlug = coinbase_ordinals.serialize()
  utxo.save()

  let transaction_ = new Transaction(transaction.txid)
  transaction_.idx = BigInt.fromI64(transaction.idx)
  transaction_.amount = BigInt.fromI64(transaction.amount)
  transaction_.fee = BigInt.zero()
  transaction_.block = block.id
  transaction_.save()
}
