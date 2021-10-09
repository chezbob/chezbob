import evdev

def discover_hid_device():
    devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
    for device in devices:
        if "Innovations Inc" in device.name:
            return device
    
    return None


def discover_nfc_device():
    import re
    import subprocess
    device_re = re.compile(b"Bus\s+(?P<bus>\d+)\s+Device\s+(?P<device>\d+).+ID\s(?P<id>\w+:\w+)\s(?P<tag>.+)$", re.I)
    try:
        df = subprocess.check_output("lsusb")
        for i in df.split(b'\n'):
            if i:
                info = device_re.match(i)
                if info:
                    dinfo = info.groupdict()
                    tag = dinfo.pop('tag').decode('utf-8').strip()
                    bus = dinfo.pop('bus').decode('utf-8').strip()
                    device = dinfo.pop('device').decode('utf-8').strip()

                    device_name = tag
                    device_path = ('/dev/bus/usb/%s/%s' % (bus,device))
                    nfc_required_device_path = 'usb:{}:{}'.format(bus, device)
                    if "RC-S380" in device_name:
                        return device_name, device_path, nfc_required_device_path
    except Exception as e:
        print("Error Occurred during auto discovering nfc device: {}".format(e))
        if "Device or resource busy" in str(e):
            print("Try: sudo modprobe -r port100")
        
    return None, None, None