import { BigInt, log } from '@graphprotocol/graph-ts';

/**
 * Represents a block of continuous ordinals assigned to a given UTXO
 */
export class OrdinalBlock {
    start: BigInt;
    size: BigInt;
   
    constructor(start: BigInt, size: BigInt) {
        this.start = start;
        this.size = size;
    }

    popNOrdinals(n: i64): OrdinalBlock {
        let num_assigned = n <= this.size.toI64() ? BigInt.fromI64(n) : this.size;

        let block = new OrdinalBlock(this.start, num_assigned);
        this.start = this.start.plus(num_assigned)
        this.size = this.start.minus(num_assigned)
        return block
    }

    contains(ordinal: BigInt): bool {
        return ordinal.ge(this.start) && ordinal.lt(this.start.plus(this.size))
    }

    offsetOf(ordinal: BigInt): BigInt {
        return ordinal.minus(this.start)
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

    popNOrdinals(n: i64): OrdinalSet {
        if (n == 0) {
            return new OrdinalSet([])
        }
        
        let total: i64 = 0
        let blocks: OrdinalBlock[] = []
    
        let idx = this.blocks.length - 1;
        let current_block = this.blocks[idx]
        while (total < n) {
            let new_block = current_block.popNOrdinals(n - total)
            blocks.push(new_block)
            total += new_block.size.toI64()
    
            if (current_block.size == BigInt.zero()) {
                this.blocks.pop()
                idx -= 1
            }
        }
    
        return new OrdinalSet(blocks)
    }

    getNthOrdinal(n: i64): BigInt {
        let total: i64 = 0
        let idx = 0;
        while (total < n) {
            total += this.blocks[idx].size.toI64()
            idx += 1
        }
    
        return this.blocks[idx - 1].start.plus(BigInt.fromI64(n - total))
    }

    contains(ordinal: BigInt): bool {
        for (let i = 0; i < this.blocks.length; ++i) {
            if (this.blocks[i].contains(ordinal)) {
                return true
            }
        }
        return false
    }

    offsetOf(ordinal: BigInt): BigInt {
        for (let i = 0; i < this.blocks.length; ++i) {
            if (this.blocks[i].contains(ordinal)) {
                return this.blocks[i].offsetOf(ordinal)
            }
        }

        return BigInt.fromI32(-1)
    }

    /**
     * Deserializes a string representing ordinal blocks into an array of OrdinalsBlock objects.
     * 
     * The input string should have the format "START0:SIZE0;START1:SIZE1;..." where each
     * pair of start and size values defines an ordinal range. This function splits the
     * string by semicolons to separate different ranges and then by colons to isolate 
     * start and size values within each range. Each pair of start and size values is used 
     * to create an OrdinalsBlock object, which is added to the resulting array.
     * 
     * @param blocks A string representing ordinal blocks, formatted as "START:SIZE;START:SIZE;..."
     * @returns An OrdinalsSet object containing the deserialized ordinal blocks.
     */
    static deserialize(blocks: string): OrdinalSet {
        let result: OrdinalBlock[] = [];
        let rangePairs: string[] = blocks.split(';');
        if (rangePairs.length == 0) {
            rangePairs = [blocks];
        };
        for (let i = 0; i < rangePairs.length; i++) {
            let parts: string[] = rangePairs[i].split(':');
            if (parts.length != 2) continue;
    
            let start = BigInt.fromString(parts[0]);
            let size = BigInt.fromString(parts[1]);
            result.push(new OrdinalBlock(start, size));
        }

        return new OrdinalSet(result);
    }

    /**
     * Serializes an OrdinalSet object into a string.
     * 
     * This function converts each OrdinalBlock object in the given set into a string
     * in the format "START:SIZE". It then concatenates these strings, separating them 
     * with semicolons, to form a single string representation of the array of ranges.
     * 
     * @returns A string representing the serialized ranges, formatted as "START:SIZE;START:SIZE;..."
     */
    serialize(): string {
        let parts: string[] = new Array<string>(this.blocks.length);
        for (let i = 0; i < this.blocks.length; i++) {
            parts[i] = this.blocks[i].start.toString() + ":" + this.blocks[i].size.toString();
        }
        return parts.join(';');
    }
}
