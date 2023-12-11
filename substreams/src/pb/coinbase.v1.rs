// @generated
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Coinbase {
    /// Value in BTC
    #[prost(double, tag="1")]
    pub value: f64,
    /// Receiver address
    #[prost(string, tag="2")]
    pub address: ::prost::alloc::string::String,
    /// The block time expressed in UNIX epoch time
    #[prost(int64, tag="3")]
    pub blocktime: i64,
}
// @@protoc_insertion_point(module)
