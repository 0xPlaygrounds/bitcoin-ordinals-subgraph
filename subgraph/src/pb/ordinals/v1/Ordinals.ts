// Code generated by protoc-gen-as. DO NOT EDIT.
// Versions:
//   protoc-gen-as v1.3.0
//   protoc        v4.25.1

import { Writer, Reader } from "as-proto/assembly";

export class Ordinals {
  static encode(message: Ordinals, writer: Writer): void {
    writer.uint32(10);
    writer.string(message.start);

    writer.uint32(18);
    writer.string(message.size);
  }

  static decode(reader: Reader, length: i32): Ordinals {
    const end: usize = length < 0 ? reader.end : reader.ptr + length;
    const message = new Ordinals();

    while (reader.ptr < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.start = reader.string();
          break;

        case 2:
          message.size = reader.string();
          break;

        default:
          reader.skipType(tag & 7);
          break;
      }
    }

    return message;
  }

  start: string;
  size: string;

  constructor(start: string = "", size: string = "") {
    this.start = start;
    this.size = size;
  }
}