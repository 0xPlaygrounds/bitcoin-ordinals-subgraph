// @generated
/// Represents a continuous block of ordinals assigned to a given UTXO
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct OrdinalsBlockAssignment {
    #[prost(string, tag="1")]
    pub utxo: ::prost::alloc::string::String,
    #[prost(int64, tag="2")]
    pub start: i64,
    #[prost(int64, tag="3")]
    pub size: i64,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Transaction {
    #[prost(string, tag="1")]
    pub txid: ::prost::alloc::string::String,
    /// Output number
    #[prost(int64, tag="2")]
    pub idx: i64,
    /// Amount transferred in sats
    #[prost(int64, tag="3")]
    pub amount: i64,
    /// Fee in sats
    /// int64 fee = 4;
    /// Ordinals assignment (only present for coinbase transaction)
    #[prost(message, optional, tag="5")]
    pub assignment: ::core::option::Option<OrdinalsBlockAssignment>,
    /// Input UTXOs
    #[prost(string, repeated, tag="6")]
    pub input_utxos: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
    /// Note: The ordinals blocks here are relative and refer to the
    /// ordinals assigned to the input UTXOs
    /// E.g.: The Nth to Mth ordinals of the input utxos should
    /// be assigned to some output utxo
    #[prost(message, repeated, tag="7")]
    pub relative_assignments: ::prost::alloc::vec::Vec<OrdinalsBlockAssignment>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Block {
    /// Block timestamp
    #[prost(int64, tag="1")]
    pub timestamp: i64,
    /// Block number
    #[prost(int64, tag="2")]
    pub number: i64,
    /// Total miner reward (in sats)
    #[prost(int64, tag="3")]
    pub miner_reward: i64,
    /// Block subsidy (in sats)
    #[prost(int64, tag="4")]
    pub subsidy: i64,
    /// Miner fees (in sats)
    #[prost(int64, tag="5")]
    pub fees: i64,
    /// Block transactions
    #[prost(message, repeated, tag="6")]
    pub txs: ::prost::alloc::vec::Vec<Transaction>,
}
// @@protoc_insertion_point(module)
