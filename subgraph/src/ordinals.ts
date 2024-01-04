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
}

export function popNOrdinals(ordinal_blocks: OrdinalBlock[], n: i64): OrdinalBlock[] {
    let total: i64 = 0
    let blocks: OrdinalBlock[] = []

    let idx = ordinal_blocks.length - 1;
    let current_block = ordinal_blocks[idx]
    while (total < n) {
        let new_block = current_block.popNOrdinals(n - total)
        blocks.push(new_block)
        total += new_block.size.toI64()

        if (current_block.size == BigInt.zero()) {
            ordinal_blocks.pop()
            idx -= 1
        }
    }

    return blocks
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
 * @returns An array of OrdinalsBlock objects, each representing a block parsed from the input string.
 */
export function deserialize(blocks: string): OrdinalBlock[] {
    let result: OrdinalBlock[] = [];
    let rangePairs: string[] = blocks.split(';');
    for (let i = 0; i < rangePairs.length; i++) {
        let parts: string[] = rangePairs[i].split(':');
        if (parts.length != 2) continue;

        let start = BigInt.fromString(parts[0]);
        let size = BigInt.fromString(parts[1]);
        result.push(new OrdinalBlock(start, size));
    }
    return result;
}

/**
 * Serializes an array of OrdinalsRange objects into a string.
 * 
 * This function converts each OrdinalsRange object in the given array into a string
 * in the format "START:SIZE". It then concatenates these strings, separating them 
 * with semicolons, to form a single string representation of the array of ranges.
 * 
 * @param ranges An array of OrdinalsRange objects to be serialized.
 * @returns A string representing the serialized ranges, formatted as "START:SIZE;START:SIZE;..."
 */
export function serialize(ranges: OrdinalBlock[]): string {
    let parts: string[] = new Array<string>(ranges.length);
    for (let i = 0; i < ranges.length; i++) {
        parts[i] = ranges[i].start.toString() + ":" + ranges[i].size.toString();
    }
    return parts.join(';');
}