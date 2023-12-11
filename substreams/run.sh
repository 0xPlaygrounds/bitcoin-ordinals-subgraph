# substreams run -e mainnet.btc.streamingfast.io:443 \
#    substreams.yaml \
#    map_transaction \
#    --start-block 819898 \
#    --stop-block +1

substreams run -e mainnet.btc.streamingfast.io:443 \
   substreams.yaml \
   map_ordinals \
   --start-block 119914 \
   --stop-block +10