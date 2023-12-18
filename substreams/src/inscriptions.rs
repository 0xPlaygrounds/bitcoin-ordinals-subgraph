/// This module defines and implements a state machine to parse Bitcoin Ordinals Inscriptions.
/// Based on https://docs.ordinals.com/inscriptions.html

use crate::pb::ordinals::v1::Inscription;

#[derive(Clone)]
pub enum Field {
    ContentType,
    Pointer,
    Parent,
    Metadata,
    MetaProtocol,
    ContentEncoding,
}

#[derive(Clone)]
pub enum State {
    None,
    Envelope,
    Inscription,
    NotInscription,
    Field(Field),
    Content,
}

impl State {
    fn bytes_to_fetch(&self) -> usize {
        match self {
            State::None => 2,
            State::Envelope => 1,
            State::Inscription => 2,
            State::NotInscription => 1,
            State::Field(_) => 1,
            State::Content => 1,
        }
    }

    fn next_state(&self, mut bytes: Vec<u8>, inscription: &mut InscriptionBuilder) -> Self {
        match (self, bytes.pop_n(self.bytes_to_fetch()).as_slice()) {
            // We enter the envelope
            (State::None, [0x00, 0x63]) => State::Envelope,

            // Envelope either contains an inscription or something else
            (State::Envelope, [size]) => {
                let data = bytes.pop_n(*size as usize);
                if String::from_utf8(data).expect("Valid string") == "ord" {
                    State::Inscription
                } else {
                    State::NotInscription
                }
            },

            // Start of different fields
            (State::Inscription, [0x01, 0x01]) => State::Field(Field::ContentType),
            (State::Inscription, [0x01, 0x02]) => State::Field(Field::Pointer),
            (State::Inscription, [0x01, 0x03]) => State::Field(Field::Parent),
            (State::Inscription, [0x01, 0x05]) => State::Field(Field::Metadata),
            (State::Inscription, [0x01, 0x07]) => State::Field(Field::MetaProtocol),
            (State::Inscription, [0x01, 0x09]) => State::Field(Field::ContentEncoding),

            // End of fields, beginning of content
            (State::Inscription, [0x01, 0x00]) => State::Content,

            // End of the envelope
            (State::NotInscription, [0x68]) => State::None,

            // Handling of different fields
            (State::Field(Field::ContentType), [size]) => {
                let content_type_bytes = bytes.pop_n(*size as usize);
                inscription.content_type(
                    String::from_utf8(content_type_bytes).expect("Valid content type")
                );
                State::Inscription
            },
            (State::Field(Field::Pointer), [size]) => {
                let pointer_bytes = bytes.pop_n(*size as usize);
                inscription.pointer(
                    parse_little_endian_uint(pointer_bytes)
                );
                State::Inscription
            },
            (State::Field(Field::Parent), [size]) => {
                let parent_bytes = bytes.pop_n(*size as usize);
                // TODO: Handle parent field
                State::Inscription
            },
            (State::Field(Field::Metadata), [size]) => {
                let metadata_bytes = bytes.pop_n(*size as usize);
                // TODO: Handle metadata field
                State::Inscription
            },
            (State::Field(Field::MetaProtocol), [size]) => {
                let metaprotocol_bytes = bytes.pop_n(*size as usize);
                // TODO: Handle metaprotocol field
                State::Inscription
            },
            (State::Field(Field::ContentEncoding), [size]) => {
                let content_encoding_bytes = bytes.pop_n(*size as usize);
                // TODO: Handle content_encoding field
                State::Inscription
            },

            (State::Content, _) => todo!(),

            // Base case: no state change
            (state, _) => state.clone(),
        }
    }
}

trait PopN<T> {
    fn pop_n(&mut self, n: usize) -> Vec<T>;
}

impl<T> PopN<T> for Vec<T> {
    fn pop_n(&mut self, n: usize) -> Vec<T> {
        let mut popped: Vec<T> = Vec::with_capacity(n);

        for _ in 0..n {
            if let Some(item) = self.pop() {
                popped.push(item)
            } else {
                break
            }
        }

        popped
    }
}

struct InscriptionBuilder {
    pub content_type: Option<String>,
    pub pointer: Option<u64>,
    pub parent: Option<String>,
    pub metadata: Option<String>,
    pub metaprotocol: Option<String>,
    pub content_encoding: Option<String>,
    pub content: String,
}

impl InscriptionBuilder {
    pub fn new() -> Self {
        Self {
            content_type: None,
            pointer: None,
            parent: None,
            metadata: None,
            metaprotocol: None,
            content_encoding: None,
            content: "".into(),
        }
    }

    pub fn content_type(&mut self, content_type: String) {
        self.content_type = Some(content_type)
    }

    pub fn pointer(&mut self, pointer: u64) {
        self.pointer = Some(pointer)
    }

    pub fn parent(&mut self, parent: String) {
        self.parent = Some(parent)
    }

    pub fn metadata(&mut self, metadata: String) {
        self.metadata = Some(metadata)
    }

    pub fn metaprotocol(&mut self, metaprotocol: String) {
        self.metaprotocol = Some(metaprotocol)
    }

    pub fn content_encoding(&mut self, content_encoding: String) {
        self.content_encoding = Some(content_encoding)
    }

    pub fn append_content(&mut self, content_part: String) {
        self.content.push_str(&content_part)
    }

    pub fn build(self) -> Inscription {
        Inscription {
            content_type: self.content_type,
            pointer: self.pointer,
            parent: self.parent,
            metadata: self.metadata,
            metaprotocol: self.metaprotocol,
            content_encoding: self.content_encoding,
            content: self.content,
        }
    }
}



/// Parses a vector of bytes into a u64 integer, interpreting the bytes in little-endian order.
///
/// This function treats the input bytes as a little-endian representation of an unsigned 64-bit integer.
/// In little-endian order, the first byte is the least significant and the last byte is the most significant.
/// The function combines these bytes to form the resulting u64 integer.
///
/// # Arguments
///
/// * `bytes` - A vector of bytes representing the number in little-endian order. The vector should not be longer than 8 bytes. 
/// If it is shorter than 8 bytes, the missing bytes are assumed to be zero (padding on the most significant side).
///
/// # Returns
///
/// This function returns a u64 integer representing the value encoded in the input bytes.
///
/// # Examples
///
/// ```
/// let bytes = vec![0x01, 0x00, 0x00, 0x00];
/// assert_eq!(parse_little_endian_uint(bytes), 1);
/// ```
///
/// # Panics
///
/// This function does not panic but silently ignores any bytes beyond the first 8 in the vector.
///
/// # Errors
///
/// This function does not return errors. Incorrect or unexpected input will be interpreted as-is.
fn parse_little_endian_uint(bytes: Vec<u8>) -> u64 {
    let mut value = 0u64;
    for (index, &byte) in bytes.iter().enumerate() {
        value |= (byte as u64) << (8 * index);
    }
    value
}
