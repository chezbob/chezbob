import asyncio
import json
import uuid
import websockets

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


async def keep_scanning(hid_scanner):
    if hid_scanner == None:
        raise Exception("Hid Device")
        return
        
    while True:
        hid_code = await wait_for_next_hid_code(hid_scanner)
        print(hid_code)
        if hid_code == None:
            continue
        else:
            hid_code = await asyncio.wait_for(connect_and_ping(hid_code[1]), timeout=1000.0)
            # Send to server
            pass

async def wait_for_next_hid_code(hid_scanner):
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
            print('timeout!')
            return None
            
        except Exception  as e :
            print("Error", e)
            return None
			    
        
