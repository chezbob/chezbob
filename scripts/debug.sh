#!/bin/bash
export DEBUG=true;
export RELAY_SERVER="ws://localhost:8080/"
tmux new-session -d -s chezbob 'node server/relay.js';
tmux split-window;
tmux send 'SERVICE_IDENT="barcode" DESTINATION_IDENT="pos" node devices/barcode.js' ENTER;
tmux split-window;
tmux send 'node server/inventory.js' ENTER;
tmux split-window;
tmux send 'npx http-server -c-1 ./web-frontend' ENTER;
tmux select-layout main-vertical;
tmux set -g mouse on;
tmux a;

