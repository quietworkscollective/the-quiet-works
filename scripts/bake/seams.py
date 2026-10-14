"""A dual-graph spanning forest unfolds each connected fitting as one padded chart."""
import bmesh

def mark_seams(objects):
    for obj in objects:
        bm = bmesh.from_edit_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        parent = list(range(len(bm.faces)))
        def root(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        candidates = []
        for edge in bm.edges:
            edge.seam = True
            faces = [face for face in edge.link_faces if face.select]
            if len(faces) == 2 and len(edge.link_faces) == 2:
                a,b = faces
                cost = a.normal.angle(b.normal, 0) - min(1, edge.calc_length()) * 0.001
                candidates.append((cost, edge, a.index, b.index))
        for _cost, edge, a, b in sorted(candidates,key=lambda item:item[0]):
            left, right = root(a), root(b)
            if left != right:
                parent[left] = right
                edge.seam = False
        bmesh.update_edit_mesh(obj.data)
