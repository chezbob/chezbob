from config import CONFIG


def main():
	nfc_scanner = None
	hid_scanner = None
	try:
		nfc_scanner = NFCScanner(CONFIG['NFC_DEVICE_PATH']) if CONFIG['NFC_DEVICE_PATH'] != None else None
		hid_scanner = NFCScanner(CONFIG['NFC_DEVICE_PATH']) if CONFIG['NFC_DEVICE_PATH'] != None else None
	except:
		pass

	if nfc_scanner == None and hid_scanner == None:
		print("Initializing NFC and HID scanner both failed, Exit")
		return

	start_scanner_non_blocking(hid_scanner)





if __name__ == "__main__":
	main()
