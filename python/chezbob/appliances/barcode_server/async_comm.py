import asyncio
import json
import uuid
import websockets
import time

URI_TEMPLATE = 'ws://192.168.1.3:8000/ws/appliances/{uuid}/'
DUMMY_SCANNER1_UUID = 'b03b4a62-57a8-4cb2-bf5d-ff4a42e7ab0d'

async def connect_and_ping(message):
    uri = URI_TEMPLATE.format(uuid=DUMMY_SCANNER1_UUID)
    print(f"Connecting to: {uri} ")
    # Send 3 messages to relay
    async with websockets.connect(uri) as ws:
        msg = {
            "header": {
                "version": 0,
                "msg_type": "scan_event",
                "msg_id": str(uuid.uuid4())[:8],
            },
            "body": {
                "barcode": f"{message}"
            }
        }
        
        await ws.send(json.dumps({
            "header": {
                "version": 0,
                "msg_type": "relay",
                "msg_id": str(uuid.uuid4())[:8],
            },
            "body": {
                "link_key": "pos",
                "payload": {
                    "msg": f"{msg}"
                },
            }
        }))

			    
async def hid_keep_scanning(hid_scanner):
    if hid_scanner == None:
        raise Exception("Hid Device None")
        return
        
    while True:
        hid_code = await wait_for_next_hid_code(hid_scanner)
        print(hid_code)
        if hid_code == None:
            continue
        else:
            # Send to server
            await asyncio.wait_for(connect_and_ping(hid_code[1]), timeout=1000.0)

async def hid_wait_for_next_barcode(hid_scanner):
    print("waiting for next hid")
    
    if hid_scanner == None:
        return None
    
    else:
        try:
            hid_code = await asyncio.wait_for(hid_scanner.get_barcode(), timeout=1000.0)
            if hid_code != None:
                # print(hid_code, type(hid_code))
                return hid_code
                
            else:
                return None
                
        except asyncio.TimeoutError:
            print('hid_wait_for_next_barcode timeout!')
            return None
            
        except Exception  as e :
            print("hid_wait_for_next_barcode Error", e)
            return None
                
        
async def nfc_keep_scanning(nfc_scanner):
    print("nfc_keep_scanning")
    if nfc_scanner == None:
        raise Exception("NFC Device None")
        return
        
    while True:
        nfc_code = await nfc_wait_for_next_barcode(nfc_scanner)
        print(nfc_code)
        if nfc_code == None:
            continue
        else:
            await asyncio.wait_for(connect_and_ping(nfc_code[1]), timeout=1000.0)
            time.sleep(0.5)
            pass

async def nfc_wait_for_next_barcode(nfc_scanner):
    print("waiting for next nfc code")
    
    if nfc_scanner == None:
        return None
    
    else:
        try:
            nfc_code = await asyncio.wait_for(nfc_scanner.get_barcode(), timeout=1000.0)
            if nfc_code[1] != None:
                # print(hid_code, type(hid_code))
                return nfc_code
                
            else:
                return None
                
        except asyncio.TimeoutError:
            print('timeout!')
            return None
            
        except Exception  as e :
            print("Error", e)
            return None
