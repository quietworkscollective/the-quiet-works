"""sRGB-transfer 8-bit lightmap, decoded by standard texture colour-space handling."""
import bpy
import json
import os
import sys
import numpy as np

def encode(values, file, minimum_scale=0):
    height, width, _channels = values.shape
    scale = max(1e-6, minimum_scale, float(values.max()))
    linear = np.clip(values / scale, 0, 1)
    encoded = np.where(linear <= .0031308, linear * 12.92, 1.055 * np.power(linear, 1/2.4) - .055)
    output = bpy.data.images.new('encoded', width, height, alpha=False)
    # Values already carry the transfer curve; save raw bytes without another conversion.
    output.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = encoded
    output.pixels.foreach_set(rgba.ravel())
    output.file_format = 'PNG'
    output.filepath_raw = file
    output.save()
    return scale

if __name__ == '__main__':
    directory = sys.argv[sys.argv.index('--')+1]
    os.makedirs(directory, exist_ok=True)
    source = [0,.0005,.005,.025,.05,.2,1.25,3.75,7.5]
    values = np.tile(np.array(source,dtype=np.float32)[None,:,None], (8,1,3))
    scale = encode(values,os.path.join(directory,'roundtrip.png'),minimum_scale=8)
    with open(os.path.join(directory,'roundtrip.json'),'w') as handle:
        json.dump({'source':source,'scale':scale},handle)
