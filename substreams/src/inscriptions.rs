/// This module defines and implements a state machine to parse Bitcoin Ordinals Inscriptions.
/// Based on https://docs.ordinals.com/inscriptions.html

use crate::pb::ordinals::v1::Inscription;

#[derive(Clone, Debug, PartialEq)]
pub enum Field {
    ContentType,
    Pointer,
    Parent,
    Metadata,
    MetaProtocol,
    ContentEncoding,
}

#[derive(Clone, Debug, PartialEq)]
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
            State::Inscription => 1,
            State::NotInscription => 1,
            State::Field(_) => 1,
            State::Content => 1,
        }
    }

    fn next_state(&self, bytes: &mut Vec<u8>, inscription: &mut InscriptionBuilder) -> Self {
        // let binding = bytes.pop_n(self.bytes_to_fetch());
        // let pat = (self, binding.as_slice());
        // println!("State: {:?}, {:02X?}", pat.0, pat.1);
        // match pat {
        match (self, bytes.pop_n(self.bytes_to_fetch()).as_slice()) {
            // We enter the envelope
            (State::None, [0x00, 0x63]) => State::Envelope,

            // Envelope either contains an inscription or something else
            (State::Envelope, [size]) => {
                let data = bytes.pop_n(*size as usize);
                match String::from_utf8(data).as_deref() {
                    Ok("ord") => State::Inscription,
                    _ => State::NotInscription
                }
            },

            // Start of different fields
            // (State::Inscription, [0x01, 0x01]) => State::Field(Field::ContentType),
            // (State::Inscription, [0x01, 0x02]) => State::Field(Field::Pointer),
            // (State::Inscription, [0x01, 0x03]) => State::Field(Field::Parent),
            // (State::Inscription, [0x01, 0x05]) => State::Field(Field::Metadata),
            // (State::Inscription, [0x01, 0x07]) => State::Field(Field::MetaProtocol),
            // (State::Inscription, [0x01, 0x09]) => State::Field(Field::ContentEncoding),
            (State::Inscription, [0x01]) => {
                match bytes.pop_n(1).as_slice() {
                    [0x01] => State::Field(Field::ContentType),
                    [0x02] => State::Field(Field::Pointer),
                    [0x03] => State::Field(Field::Parent),
                    [0x05] => State::Field(Field::Metadata),
                    [0x07] => State::Field(Field::MetaProtocol),
                    [0x09] => State::Field(Field::ContentEncoding),
                    flag => panic!("Unexpected field flag! {flag:?}")
                }
            },

            // End of fields, beginning of content
            // (State::Inscription, [0x01, 0x00]) => State::Content,
            (State::Inscription, [0x00]) => State::Content,

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
                    parse_little_endian_uint(pointer_bytes) as i64
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

            // End of content
            (State::Content, [0x68]) => State::None,
            // Content
            (State::Content, [0x4c]) => {
                let size = bytes.pop_n(1);
                let content_bytes = bytes.pop_n(parse_little_endian_uint(size) as usize);
                inscription.append_content(
                    // if inscription.content_type.as_ref()
                    //     .map(|content_type| content_type.starts_with("text"))
                    //     .unwrap_or(false)
                    // {
                    //     String::from_utf8(content_bytes).expect(&format!("Valid content {:?}", inscription.content_type))
                    // } else {
                    //     hex::encode(content_bytes)
                    // }
                    match String::from_utf8(content_bytes.clone()) {
                        Ok(content) => content,
                        Err(_) => hex::encode(content_bytes)
                    }
                );
                State::Content
            },
            (State::Content, [0x4d]) => {
                let size = bytes.pop_n(2);
                let content_bytes = bytes.pop_n(parse_little_endian_uint(size) as usize);
                inscription.append_content(
                    match String::from_utf8(content_bytes.clone()) {
                        Ok(content) => content,
                        Err(_) => hex::encode(content_bytes)
                    }
                );
                State::Content
            },
            (State::Content, [0x4e]) => {
                let size = bytes.pop_n(3);
                let content_bytes = bytes.pop_n(parse_little_endian_uint(size) as usize);
                inscription.append_content(
                    match String::from_utf8(content_bytes.clone()) {
                        Ok(content) => content,
                        Err(_) => hex::encode(content_bytes)
                    }
                );
                State::Content
            },
            (State::Content, [size]) => {
                let content_bytes = bytes.pop_n(*size as usize);
                inscription.append_content(
                    match String::from_utf8(content_bytes.clone()) {
                        Ok(content) => content,
                        Err(_) => hex::encode(content_bytes)
                    }
                );
                State::Content
            },

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
    pub id: String,
    pub content_type: Option<String>,
    pub pointer: Option<i64>,
    pub parent: Option<String>,
    pub metadata: Option<String>,
    pub metaprotocol: Option<String>,
    pub content_encoding: Option<String>,
    pub content: String,
}

impl InscriptionBuilder {
    pub fn new(id: String) -> Self {
        Self {
            id,
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

    pub fn pointer(&mut self, pointer: i64) {
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
            id: self.id,
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

pub fn parse_inscriptions(txid: String, mut bytes: Vec<u8>) -> Vec<Inscription> {
    bytes.reverse();

    let mut state = State::None;
    let mut inscriptions = vec![];
    let mut builder = InscriptionBuilder::new(format!("{txid}i0"));

    while bytes.len() > 0 {
        let new_state = state.next_state(&mut bytes, &mut builder);
        
        if state == State::Content && new_state == State::None {
            // We have a new inscription!
            inscriptions.push(builder.build());
            builder = InscriptionBuilder::new(format!("{txid}i{}", inscriptions.len()));
        }
        state = new_state
    }

    if state != State::None && state != State::NotInscription {
        panic!("Incomplete inscription parsing")
    }

    inscriptions
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


#[cfg(test)]
mod tests {
    use crate::pb::ordinals::v1::Inscription;

    use super::parse_inscriptions;

    #[test]
    fn test_inscription_parsing_1() {
        let bytes = hex::decode("020000000001014f6864054ab62b8f117864e3da82860c9228e08f991b18c230639e46b5867b0a0000000000fdffffff0222020000000000001600147b1af8377c5dead9eb248dfd1abb1beaee4f01cc73050000000000001600148bb6a9b6377fcfa3c795463e626572bdfb6a04170340831e5c34cda94e19ac8555f872b51bb33befb3e90010280d8875f24a4a2db298ed24ff7e8c62aefe143427ce3d6d09724aaef12dac7f0ec960603ae51a622763812068907e44b6ebd5e4c74479650cd5c6069c4858764b8e679b6c8a9995a8f69d07ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d38003b7b2270223a226272632d3230222c226f70223a227472616e73666572222c227469636b223a22504c5858222c22616d74223a22363736373030227d6821c13483067951fefc4cc8dd18b855bf4b3e8079fb6f6b7ec319ee6eeacfc678a29300000000")
            .expect("hex");

        let inscriptions = parse_inscriptions("ABC".into(), bytes);

        assert_eq!(
            inscriptions,
            vec![
                Inscription { 
                    id: "ABCi0".into(),
                    content_type: Some("text/plain;charset=utf-8".into()), 
                    pointer: None, 
                    parent: None, 
                    metadata: None, 
                    metaprotocol: None, 
                    content_encoding: None, 
                    content: "{\"p\":\"brc-20\",\"op\":\"transfer\",\"tick\":\"PLXX\",\"amt\":\"676700\"}".into()
                }
            ]
        )
    }
}