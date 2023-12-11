// @generated
/// Represents a range of ordinals assigned to a given UTXO
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Ordinals {
    #[prost(string, tag="1")]
    pub start: ::prost::alloc::string::String,
    #[prost(string, tag="2")]
    pub end: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct OrdinalsAssignment {
    #[prost(string, tag="1")]
    pub utxo: ::prost::alloc::string::String,
    #[prost(message, optional, tag="2")]
    pub ordinals: ::core::option::Option<Ordinals>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct OrdinalsTransfers {
    #[prost(string, repeated, tag="1")]
    pub input_utxos: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
    #[prost(message, repeated, tag="2")]
    pub relative_assignments: ::prost::alloc::vec::Vec<OrdinalsAssignment>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Transaction {
    #[prost(string, tag="1")]
    pub txid: ::prost::alloc::string::String,
    /// Output number
    #[prost(uint64, tag="2")]
    pub idx: u64,
    #[prost(message, repeated, tag="3")]
    pub assigments: ::prost::alloc::vec::Vec<OrdinalsAssignment>,
    #[prost(message, optional, tag="4")]
    pub transfers: ::core::option::Option<OrdinalsTransfers>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Block {
    #[prost(uint64, tag="1")]
    pub timestamp: u64,
    #[prost(uint64, tag="2")]
    pub block: u64,
    #[prost(message, repeated, tag="3")]
    pub txs: ::prost::alloc::vec::Vec<Transaction>,
}
// @@protoc_insertion_point(module)
