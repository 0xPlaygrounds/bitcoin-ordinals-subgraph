use substreams::scalar::BigInt;

use crate::pb::ordinals::v1 as ord;

pub struct OrdinalsRange {
    pub start: BigInt,
    pub end: BigInt,
}

pub struct OrdinalsTransfer {
    pub input_utxo: String,
    pub output_utxo: String,
    pub relative_ordinals: OrdinalsRange
}

pub struct OrdinalsAssignment {
    pub utxo: String,
    pub ordinals: OrdinalsRange,
}

impl OrdinalsRange {
    pub fn len(&self) -> BigInt {
        self.end.clone() - self.start.clone() + 1
    }

    // "Consumes" `amount` of ordinals in self and return a new ordinals
    // range containing the consumed ordinals. Self is updated to contain
    // the remainder of the ordinals
    pub fn consume(&mut self, amount: BigInt) -> OrdinalsRange {
        let new_range = OrdinalsRange {
            start: self.start.clone(),
            end: self.start.clone() + amount.clone() - 1,
        };
        self.start = self.start.clone() + amount;
        new_range
    }
}

impl From<OrdinalsRange> for ord::Ordinals {
    fn from(value: OrdinalsRange) -> Self {
        Self {
            start: value.start.into(),
            end: value.end.into(),
        }
    }
}

