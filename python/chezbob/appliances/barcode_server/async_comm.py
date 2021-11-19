import asyncio

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
			    
        
