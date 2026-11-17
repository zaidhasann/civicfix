import os, sys
from pathlib import Path
sys.path.append(r'D:\civicfix\services\agent\src')
from civicfix_agent.resolver import resolve_location
from civicfix_agent.up_directory import UPWardDirectory
from civicfix_agent.vector_store import create_vector_store

csv_path = Path('D:/civicfix/services/agent/data/up_ward_directory.csv')
up_dir = UPWardDirectory(csv_path)
vector_store = create_vector_store()

addresses = [
    # 1. Lucknow Nagar Nigam HQ
    {
        'road': 'Nagar Nigam HQ, Lalbagh',
        'city': 'Lucknow',
        'district': 'Lucknow',
        'state': 'Uttar Pradesh',
    },
    # 2. Kanpur Municipal Corp (Nagar Nigam)
    {
        'road': 'GT Road',
        'city': 'Kanpur',
        'district': 'Kanpur',
        'state': 'Uttar Pradesh',
    },
    # 3. Aligarh Nagar Panchayat
    {
        'road': 'Aligarh City Center',
        'city': 'Aligarh',
        'district': 'Aligarh',
        'state': 'Uttar Pradesh',
    },
    # 4. Varanasi Nagar Nigam
    {
        'road': 'Varanasi City',
        'city': 'Varanasi',
        'district': 'Varanasi',
        'state': 'Uttar Pradesh',
    },
]

for idx, addr in enumerate(addresses, 1):
    result = resolve_location(addr, 'pothole', vector_store, up_directory=up_dir)
    print(f'[{idx}] Address: {addr}')
    print('    Email:', result.email)
    print('    Full result:', result)
    print('---')
