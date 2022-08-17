#!/bin/bash
export DEBUG=true;
export RELAY_SERVER='ws://localhost:8080/'
tmux new-session -d -s chezbob "DEPLOYMENT_MODE='development' HTTP_PORT=8080 node web/internal.js";
tmux split-window;
tmux send "DEPLOYMENT_MODE='development' RELAY_SERVER=$RELAY_SERVER node inventory" ENTER;
tmux new-window;
tmux send "SERVICE_IDENT='flow' DESTINATION_IDENT='coldbrew' RELAY_SERVER=$RELAY_SERVER node scripts/debug_flow" ENTER;
tmux split-window;
tmux send "SERVICE_IDENT='barcode' DESTINATION_IDENT='pos' RELAY_SERVER=$RELAY_SERVER node scripts/debug_barcode" ENTER;
tmux split-window;
tmux send "SERVICE_IDENT='cash' DESTINATION_IDENT='pos' RELAY_SERVER=$RELAY_SERVER node scripts/debug_cash" ENTER;
tmux select-layout main-vertical;
tmux set -g mouse on;
tmux set remain-on-exit on
tmux a;

