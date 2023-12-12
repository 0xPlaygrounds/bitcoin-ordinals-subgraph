use substreams::scalar::BigInt;

use crate::pb::ordinals::v1 as ord;

pub struct OrdinalsBlock {
    pub start: BigInt,
    pub size: BigInt,
}

pub struct OrdinalsTransfer {
    pub input_utxo: String,
    pub output_utxo: String,
    pub relative_ordinals: OrdinalsBlock
}

pub struct OrdinalsAssignment {
    pub utxo: String,
    pub ordinals: OrdinalsBlock,
}

impl OrdinalsBlock {
    pub fn len(&self) -> BigInt {
        self.size.clone() - self.start.clone() + 1
    }

    // "Consumes" `amount` of ordinals in self and return a new ordinals
    // range containing the consumed ordinals. Self is updated to contain
    // the remainder of the ordinals
    pub fn consume(&mut self, amount: BigInt) -> OrdinalsBlock {
        let new_range = OrdinalsBlock {
            start: self.start.clone(),
            size: self.start.clone() + amount.clone() - 1,
        };
        self.start = self.start.clone() + amount;
        new_range
    }
}

impl From<OrdinalsBlock> for ord::Ordinals {
    fn from(value: OrdinalsBlock) -> Self {
        Self {
            start: value.start.into(),
            size: value.size.into(),
        }
    }
}

