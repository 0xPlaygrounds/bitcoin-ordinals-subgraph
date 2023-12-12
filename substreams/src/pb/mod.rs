// @generated
pub mod ordinals {
    // @@protoc_insertion_point(attribute:ordinals.v1)
    pub mod v1 {
        include!("ordinals.v1.rs");
        // @@protoc_insertion_point(ordinals.v1)
    }
}
pub mod sf {
    pub mod bitcoin {
        pub mod r#type {
            // @@protoc_insertion_point(attribute:sf.bitcoin.type.v1)
            pub mod v1 {
                include!("sf.bitcoin.type.v1.rs");
                // @@protoc_insertion_point(sf.bitcoin.type.v1)
            }
        }
    }
    // @@protoc_insertion_point(attribute:sf.substreams)
    pub mod substreams {
        include!("sf.substreams.rs");
        // @@protoc_insertion_point(sf.substreams)
        pub mod rpc {
            // @@protoc_insertion_point(attribute:sf.substreams.rpc.v2)
            pub mod v2 {
                include!("sf.substreams.rpc.v2.rs");
                // @@protoc_insertion_point(sf.substreams.rpc.v2)
            }
        }
        pub mod sink {
            pub mod service {
                // @@protoc_insertion_point(attribute:sf.substreams.sink.service.v1)
                pub mod v1 {
                    include!("sf.substreams.sink.service.v1.rs");
                    // @@protoc_insertion_point(sf.substreams.sink.service.v1)
                }
            }
        }
        // @@protoc_insertion_point(attribute:sf.substreams.v1)
        pub mod v1 {
            include!("sf.substreams.v1.rs");
            // @@protoc_insertion_point(sf.substreams.v1)
        }
    }
}
