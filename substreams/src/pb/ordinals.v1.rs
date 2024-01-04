// @generated
/// Represents a continuous block of ordinals assigned to a given UTXO
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct OrdinalsBlockAssignment {
    #[prost(string, tag="1")]
    pub utxo: ::prost::alloc::string::String,
    #[prost(string, optional, tag="2")]
    pub address: ::core::option::Option<::prost::alloc::string::String>,
    #[prost(int64, tag="3")]
    pub start: i64,
    #[prost(int64, tag="4")]
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
    #[prost(message, optional, tag="4")]
    pub assignment: ::core::option::Option<OrdinalsBlockAssignment>,
    /// Input UTXOs
    #[prost(string, repeated, tag="5")]
    pub input_utxos: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
    /// Note: The ordinals blocks here are relative and refer to the
    /// ordinals assigned to the input UTXOs
    /// E.g.: The Nth to Mth ordinals of the input utxos should
    /// be assigned to some output utxo
    #[prost(message, repeated, tag="6")]
    pub relative_assignments: ::prost::alloc::vec::Vec<OrdinalsBlockAssignment>,
    #[prost(message, repeated, tag="7")]
    pub inscriptions: ::prost::alloc::vec::Vec<Inscription>,
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
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Inscription {
    #[prost(string, tag="1")]
    pub id: ::prost::alloc::string::String,
    /// Optional MIME type of the inscription
    #[prost(string, optional, tag="2")]
    pub content_type: ::core::option::Option<::prost::alloc::string::String>,
    /// Optional pointer if the inscription is not for the 
    /// first ordinal of its inputs
    #[prost(int64, optional, tag="3")]
    pub pointer: ::core::option::Option<i64>,
    /// Note: Not implemented
    #[prost(string, optional, tag="4")]
    pub parent: ::core::option::Option<::prost::alloc::string::String>,
    /// Note: Not implemented
    #[prost(string, optional, tag="5")]
    pub metadata: ::core::option::Option<::prost::alloc::string::String>,
    /// Note: Not implemented
    #[prost(string, optional, tag="6")]
    pub metaprotocol: ::core::option::Option<::prost::alloc::string::String>,
    /// Note: Not implemented
    #[prost(string, optional, tag="7")]
    pub content_encoding: ::core::option::Option<::prost::alloc::string::String>,
    /// Content of the inscription
    #[prost(string, tag="8")]
    pub content: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Inscriptions {
    #[prost(message, repeated, tag="1")]
    pub inscriptions: ::prost::alloc::vec::Vec<Inscription>,
}
// @@protoc_insertion_point(module)
