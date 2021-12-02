#!/bin/bash
export DEBUG=true;
export RELAY_SERVER="ws://localhost:8080/"
tmux new-session -d -s chezbob 'node server/relay.js';
tmux split-window;
tmux send 'node server/barcode.js' ENTER;
tmux split-window;
tmux send 'node server/inventory/inventory.js' ENTER;
tmux split-window;
tmux send 'npx http-server -c-1 ./site' ENTER;
tmux select-layout main-vertical;
tmux set -g mouse on;
tmux a;

