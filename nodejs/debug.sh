#!/bin/bash
export DEBUG=true;
tmux new-session -d -s chezbob 'node relay/relay.js';
tmux split-window;
tmux send 'node barcode/barcode.js' ENTER;
tmux split-window;
tmux send 'node inventory/inventory.js' ENTER;
tmux split-window;
tmux send 'npx http-server ../site' ENTER;
tmux select-layout main-vertical;
tmux set -g mouse on;
tmux a;

