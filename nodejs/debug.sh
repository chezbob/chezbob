#!/bin/bash
export DEBUG=true;
tmux new-session -d -s chezbob 'node server/relay/relay.js';
tmux split-window;
tmux send 'node server/barcode/barcode.js' ENTER;
tmux split-window;
tmux send 'node server/inventory/inventory.js' ENTER;
tmux split-window;
tmux send 'npx http-server ./site' ENTER;
tmux select-layout main-vertical;
tmux set -g mouse on;
tmux a;

