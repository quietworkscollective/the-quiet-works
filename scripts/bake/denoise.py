"""Use the OpenImageDenoise library bundled with the pinned Blender installation."""
import ctypes
import os
import numpy as np
import bpy

def denoise(image):
    path = os.path.join(os.path.dirname(bpy.app.binary_path), '..', 'Resources', 'lib', 'libOpenImageDenoise.dylib')
    lib = ctypes.CDLL(path)
    pointer = ctypes.c_void_p
    size = ctypes.c_size_t
    signatures = {
        'oidnNewDevice': (pointer, [ctypes.c_int]),
        'oidnCommitDevice': (None, [pointer]),
        'oidnNewFilter': (pointer, [pointer, ctypes.c_char_p]),
        'oidnSetSharedFilterImage': (None, [pointer, ctypes.c_char_p, pointer, ctypes.c_int, size, size, size, size, size]),
        'oidnSetFilterBool': (None, [pointer, ctypes.c_char_p, ctypes.c_bool]),
        'oidnCommitFilter': (None, [pointer]),
        'oidnExecuteFilter': (None, [pointer]),
        'oidnGetDeviceError': (ctypes.c_int, [pointer, ctypes.POINTER(ctypes.c_char_p)]),
        'oidnReleaseFilter': (None, [pointer]),
        'oidnReleaseDevice': (None, [pointer]),
    }
    for name, (result, args) in signatures.items():
        fn = getattr(lib, name)
        fn.restype = result
        fn.argtypes = args
    width, height = image.size
    rgba = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(rgba)
    rgb = np.ascontiguousarray(rgba.reshape(height, width, 4)[:, :, :3])
    output = np.empty_like(rgb)
    device = lib.oidnNewDevice(1)  # CPU; Metal execution can stall in background sessions.
    lib.oidnCommitDevice(device)
    filt = lib.oidnNewFilter(device, b'RT')
    try:
        for name, values in [(b'color', rgb), (b'output', output)]:
            lib.oidnSetSharedFilterImage(filt, name, values.ctypes.data, 3, width, height, 0, 12, width * 12)
        lib.oidnSetFilterBool(filt, b'hdr', True)
        lib.oidnCommitFilter(filt)
        lib.oidnExecuteFilter(filt)
        message = ctypes.c_char_p()
        error = lib.oidnGetDeviceError(device, ctypes.byref(message))
        if error:
            raise RuntimeError('Denoiser: ' + str(message.value))
        return output
    finally:
        lib.oidnReleaseFilter(filt)
        lib.oidnReleaseDevice(device)
