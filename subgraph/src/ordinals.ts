import { BigInt, Bytes, log } from '@graphprotocol/graph-ts';

/**
 * Represents a block of continuous ordinals assigned to a given UTXO
 */
export class OrdinalBlock {
    start: u64;
    size: u64;
   
    constructor(start: u64, size: u64) {
        this.start = start;
        this.size = size;
    }

    popNOrdinals(n: u64): OrdinalBlock {
        let num_assigned = n <= this.size ? n : this.size;

        let block = new OrdinalBlock(this.start, num_assigned);
        this.start = this.start + num_assigned
        this.size = this.start - num_assigned
        return block
    }

    contains(ordinal: u64): bool {
        return ordinal >= this.start && ordinal < this.start + this.size
    }

    offsetOf(ordinal: u64): u64 {
        return ordinal - this.start
    }
}

/**
 * Represents a set of OrdinalBlock objects.
 */
export class OrdinalSet {
    blocks: OrdinalBlock[];

    constructor(blocks: OrdinalBlock[]) {
        this.blocks = blocks;
    }

    append_block(block: OrdinalBlock): void {
        this.blocks.push(block)
    }

    append_blocks(blocks: OrdinalBlock[]): void {
        this.blocks = this.blocks.concat(blocks)
    }

    append_set(other: OrdinalSet): void {
        this.blocks = this.blocks.concat(other.blocks)
    }

    popNOrdinals(n: u64): OrdinalSet {
        if (n == 0) {
            return new OrdinalSet([])
        }
        
        let total: u64 = 0
        let blocks: OrdinalBlock[] = []
    
        let idx = this.blocks.length - 1;
        let current_block = this.blocks[idx]
        while (total < n) {
            let new_block = current_block.popNOrdinals(n - total)
            blocks.push(new_block)
            total += new_block.size
    
            if (current_block.size == 0) {
                this.blocks.pop()
                idx -= 1
            }
        }
    
        return new OrdinalSet(blocks)
    }

    getNthOrdinal(n: u64): u64 {
        let total: u64 = 0
        let idx = 0;
        while (total < n) {
            total += this.blocks[idx].size
            idx += 1
        }
    
        return this.blocks[idx - 1].start + n - total
    }

    contains(ordinal: u64): bool {
        for (let i = 0; i < this.blocks.length; ++i) {
            if (this.blocks[i].contains(ordinal)) {
                return true
            }
        }
        return false
    }

    offsetOf(ordinal: u64): u64 {
        for (let i = 0; i < this.blocks.length; ++i) {
            if (this.blocks[i].contains(ordinal)) {
                return this.blocks[i].offsetOf(ordinal)
            }
        }

        return -1
    }

    /**
     * Deserializes binary data into an OrdinalSet object.
     * 
     * This function takes an ArrayBuffer containing binary data and converts it into
     * an OrdinalSet object. It reads the binary data in chunks of 8 bytes, where each
     * chunk represents an OrdinalBlock with a start and size. It creates a new OrdinalBlock
     * object for each chunk and adds it to the blocks array.
     * 
     * @param binaryData The binary data to deserialize.
     * @returns An OrdinalSet object representing the deserialized data.
     */
    static deserialize(binaryData: Bytes): OrdinalSet {
        const dataView = new DataView(binaryData.buffer);
        // log.debug("Deserializing OrdinalSet. Bytes: {}, length: {}", [binaryData.toHexString(), dataView.byteLength.toString()]);
        let blocks: OrdinalBlock[] = [];

        for (let i = 0; i * 16 < dataView.byteLength; i++) {
            const start = dataView.getUint64(i * 16, true);
            const size = dataView.getUint64(i * 16 + 8, true);
            blocks.push(new OrdinalBlock(start, size));
        }

        return new OrdinalSet(blocks);
    }

    /**
     * Serializes the OrdinalSet into binary format.
     * Each OrdinalBlock is represented as a pair of 64-bit integers (start and size).
     * @returns {ArrayBuffer} The serialized OrdinalSet.
     */
    serialize(): Bytes {
        const bytes = new Bytes(this.blocks.length * 16); // 16 bytes for each block (2 * 64-bit)
        const view = new DataView(bytes.buffer);

        for (let i = 0; i < this.blocks.length; i++) {
            const block = this.blocks[i];
            view.setUint64(i * 16, block.start, true);
            view.setUint64(i * 16 + 8, block.size, true);
        }
        // log.debug("Serializing OrdinalSet. Blocks: {}, Bytes: {}", [
        //     this.blocks.map<String>((block) => {
        //         return `(${block.start}, ${block.size})`;
        //     }).join(', '),
        //     bytes.toHexString(),
        // ])
        return bytes;
    }
}
