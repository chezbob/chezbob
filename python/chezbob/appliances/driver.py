from barcode_server.config import CONFIG
from barcode_server.device_auto_discover import discover_hid_device, discover_nfc_device
from barcode_server.hid_scanner import HIDBarcodeScanner
from barcode_server.nfc_scanner import NFCScanner
from barcode_server.async_comm import nfc_keep_scanning, hid_keep_scanning
import asyncio

async def main():
	nfc_scanner = None
	hid_scanner = None
	try:
		if CONFIG['HID_DEVICE_PATH'] == None:
			print("HID_DEVICE_PATH in config is none, auto discovering...")
			device_info = discover_hid_device()
			if device_info != None:
				print("Auto Discover Hid Device, Found: {} (path), {} (name), {} (phys)".format(device_info.path, device_info.name, device_info.phys))
				CONFIG['HID_DEVICE_PATH'] = device_info.path
			else:
				print("Auto Discover HID Device Failed")
		else:
			print("Using HID Device Path From Config: {}".format(CONFIG['HID_DEVICE_PATH']))
		print()
		
		if CONFIG['NFC_DEVICE_PATH'] == None:
			print("NFC_DEVICE_PATH in config is none, auto discovering...")
			device_name, device_path, nfc_required_device_path = discover_nfc_device()
			print(device_name, device_path)
			if device_path != None:
				CONFIG['NFC_DEVICE_PATH'] = nfc_required_device_path
				print("Auto Discover NFC Device, Found: {} (path), {} (name), {} (nfc compatible path)".format(device_name, device_path, nfc_required_device_path))
			else:
				print("Auto Discover NFC Device Failed")
		else:
			print("Using NFC Device Path From Config: {}".format(CONFIG['NFC_DEVICE_PATH']))
		print()
				
		
		if CONFIG['HID_DEVICE_PATH'] != None:
			hid_scanner = HIDBarcodeScanner(CONFIG['HID_DEVICE_PATH'])
			print("HID Device Started Properly")
		else:
			hid_scanner = None
			print("Skipping HID Device, as path is none")

		if CONFIG['NFC_DEVICE_PATH'] != None:
			nfc_scanner = NFCScanner(CONFIG['NFC_DEVICE_PATH'])
			print("NFC Device Started Properly")
		else:
			nfc_scanner = None
			print("Skipping NFC Device, as path is none")

	except Exception as e:
		print("Error Occurrred while starting HID and NFC devices: {}".format(e))
		return 

	if nfc_scanner == None and hid_scanner == None:
		print("Initializing NFC and HID scanner both failed, Exit")
		return
	
	# start_scanner_non_blocking(hid_scanner)
	if hid_scanner != None:
		await hid_keep_scanning(hid_scanner)
	elif nfc_scanner != None:
		await nfc_keep_scanning(nfc_scanner)
	else:
		raise Exception("Illegal State in starting the script")
	

if __name__ == "__main__":
	asyncio.run(main())
