# Bitcoin Ordinals Substreams and Subgraph
This project contains a substreams-powered subgraph for tracking Bitcoin Ordinals assignments and Inscriptions.

## Bitcoin Ordinals Substreams
The substreams extracts information about newly minted sats, their ordinals number as well as which UTXO they are assigned to. Moreover, for each transaction, the substreams will extract the relative assignment of ordinals (e.g.: the first `N` ordinals from input UTXO `A` is now assigned to UTXO `B`). This information will be used by the subgraph to do the final assignment of the ordinals using the subgraph database as a "cache" that contains the entire UTXO set and the ordinals assignments to each UTXO.

## Bitcoin Ordinals Subgraph
The subgraph consists of a handler that reads the output of the substreams and performs the final Ordinals assignment. Whereas most messages coming out of the substreams will be relative assignments, the subgraph will create concrete assignments using the latter with the UTXO set it maintains.