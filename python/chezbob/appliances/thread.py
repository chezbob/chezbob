from threading import Thread

def start_scanner_non_blocking(scanner_object):
	if scanner_object == None:
		return

	