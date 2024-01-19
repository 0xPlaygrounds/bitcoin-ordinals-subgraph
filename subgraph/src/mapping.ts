import { BigInt, ByteArray, Bytes, log } from '@graphprotocol/graph-ts';
import { Block as ProtoBlock } from "./pb/ordinals/v1/Block"
import { Block, Inscription, Transaction, Utxo } from '../generated/schema';
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

function getNthSatUtxo(utxos: Utxo[], n: u64): Utxo {
  let total: u64 = 0
  let idx = 0;
  while (total < n) {
    total += utxos[idx].amount.toU64()
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
    inscription.genesisAddress = transaction.relativeOrdinals[0].address
    inscription.ordinal = BigInt.fromU64(input_ordinals.getNthOrdinal(transaction.inscriptions[insc].pointer))
    inscription.genesisUtxo = getNthSatUtxo(input_utxos, transaction.inscriptions[insc].pointer).id
    inscriptions.push(inscription)
  }

  // Assign ordinals to output UTXOs
  log.debug("Assigning ordinals to output UTXOs", [])
  for (let i = 0; i < transaction.relativeOrdinals.length; ++i) {
    let utxo = new Utxo(transaction.relativeOrdinals[i].utxo)
    utxo.address = transaction.relativeOrdinals[i].address
    utxo.amount = BigInt.fromU64(transaction.relativeOrdinals[i].size)
    utxo.unspent = true
    utxo.transaction = transaction.txid
    
    let utxo_ordinals = input_ordinals.popNOrdinals(transaction.relativeOrdinals[i].size)
    // Assign inscriptions to UTXO
    for(let j = 0; j < inscriptions.length; ++j) {
      if (utxo_ordinals.contains(inscriptions[j].ordinal.toU64())) {
        inscriptions[j].location = utxo.id
        inscriptions[j].locationOffset = BigInt.fromU64(utxo_ordinals.offsetOf(inscriptions[j].ordinal.toU64()))
        inscriptions[j].save()
      }
    }
    utxo.ordinalsSlug = Bytes.fromUint8Array(utxo_ordinals.serialize())
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
  log.debug("Processing coinbase transaction {}", [transaction.txid])
  
  let coinbase_ordinals: OrdinalSet = new OrdinalSet([]);
  for (let i = 0; i < transaction.coinbaseOrdinals.length; ++i) {
    coinbase_ordinals.append_block(new OrdinalBlock(
      transaction.coinbaseOrdinals[i].start,
      transaction.coinbaseOrdinals[i].size,
    ))
  }
  coinbase_ordinals.append_set(fees_ordinals)

  log.debug("Assigning ordinals to output UTXOs", [])
  for (let i = 0; i < transaction.coinbaseOrdinals.length; ++i) {
    let utxo = new Utxo(transaction.coinbaseOrdinals[i].utxo)
    utxo.amount = BigInt.fromU64(transaction.coinbaseOrdinals[i].size)
    utxo.unspent = true
    utxo.transaction = transaction.txid

    let utxo_ordinals = coinbase_ordinals.popNOrdinals(transaction.coinbaseOrdinals[i].size)
    utxo.ordinalsSlug = Bytes.fromUint8Array(utxo_ordinals.serialize())
    utxo.save()
  }

  let transaction_ = new Transaction(transaction.txid)
  transaction_.idx = BigInt.fromI64(transaction.idx)
  transaction_.amount = BigInt.fromI64(transaction.amount)
  transaction_.fee = BigInt.zero()
  transaction_.block = block.id
  transaction_.save()
}
