/* Unity export: a .unitypackage (double-click it, or Assets › Import Package) with
     Sprites/       one PNG per layer frame, imported as sprites (pivot on the layer's origin, 100 px = 1 unit),
                    packed together by "<name> Atlas.spriteatlas" (a Sprite Atlas over the folder)
     <name>.prefab  GameObjects for groups, layers (SpriteRenderer, sorting order = layer order),
                    masks (SpriteMask, the layers they mask show inside or outside), rigs (a GameObject per
                    bone, segmented bones are chains), controllers (empty GameObjects) and an Animator
     Animations/    one AnimationClip per chosen screen, all in <name>.controller (one state each)
     <name>.unity   a scene with the prefab and an orthographic camera framing the screen
   Layers that bend with a rig get a SpriteSkin (2D Animation package) driven by the bone GameObjects;
   their sprite bones and weights are set by Editor/StoryboardRigSetup.cs when the package is imported.
   Layers that ride on a bone are children of that bone. All motion is baked frame by frame.
   SB.unity.build(screens, { fps, base, prog }) → { files: [{ name, blob }], warnings } */
'use strict';
(function (SB) {
  const U = SB.util, B = SB.bake, E = SB.engines;
  const te = new TextEncoder();
  const n = v => { if (!isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity'; const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? '0' : String(r); };
  const ystr = s => /^[\w .()\-]*$/.test(s) && !/^\s|\s$/.test(s) && s !== '' ? s : `'${String(s).replace(/'/g, "''")}'`;
  const goName = s => (String(s).replace(/[\/\\\n\r]/g, ' ').trim() || 'Object').slice(0, 60);
  const fileName = s => (String(s).replace(/[^\w\- ]+/g, ' ').trim().replace(/\s+/g, ' ') || 'Animation').slice(0, 50);

  // ---------- hashes: Unity keys paths and attribute names by CRC-32; GUIDs and file ids are made from the names, so exporting again updates the same assets
  const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
  const crc32 = s => { const b = te.encode(s); let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function sha(s) { const d = new Uint8Array(await crypto.subtle.digest('SHA-1', te.encode(s))); return d; }
  const hex = d => [...d].map(x => x.toString(16).padStart(2, '0')).join('');
  async function guidOf(s) { return hex((await sha('sb-guid:' + s)).slice(0, 16)); }
  async function fileIdOf(s) { const d = await sha('sb-fid:' + s); let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(d[i]); v = v & ((1n << 62n) - 1n); if (v < 1000000n) v += 1000000n; return v.toString(); }

  // ---------- .unitypackage = a gzipped tar of <guid>/asset, <guid>/asset.meta, <guid>/pathname
  function tar(entries) {
    const blocks = [];
    for (const { name, data } of entries) {
      const h = new Uint8Array(512), put = (s, off, len) => { const b = te.encode(s); h.set(b.slice(0, len), off); };
      put(name, 0, 100); put('0000644\0', 100, 8); put('0000000\0', 108, 8); put('0000000\0', 116, 8);
      put(data.length.toString(8).padStart(11, '0') + '\0', 124, 12); put(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12);
      h.fill(32, 148, 156); h[156] = 48; put('ustar\0', 257, 6); put('00', 263, 2);
      let sum = 0; for (const x of h) sum += x; put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
      blocks.push(h, data); const pad = (512 - data.length % 512) % 512; if (pad) blocks.push(new Uint8Array(pad));
    }
    blocks.push(new Uint8Array(1024)); return new Blob(blocks);
  }
  async function gzip(blob) {
    if (typeof CompressionStream === 'undefined') throw new Error('This browser can’t write .unitypackage files (no CompressionStream). Try Chrome, Edge, Firefox or Safari 16.4+.');
    return new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  }

  // ---------- meta files
  const META = {
    folder: g => `fileFormatVersion: 2\nguid: ${g}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`,
    native: (g, main) => `fileFormatVersion: 2\nguid: ${g}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: ${main}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`,
    prefab: g => `fileFormatVersion: 2\nguid: ${g}\nPrefabImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`,
    plain: (g, imp) => `fileFormatVersion: 2\nguid: ${g}\n${imp}:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`,
    script: g => `fileFormatVersion: 2\nguid: ${g}\nMonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`,
    sprite: (g, o) => `fileFormatVersion: 2\nguid: ${g}\n${o.rig ? 'labels:\n- StoryboardRig\n' : ''}TextureImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 12
  mipmaps:
    mipMapMode: 0
    enableMipMap: 0
    sRGBTexture: 1
    linearTexture: 0
    fadeOut: 0
    borderMipMap: 0
    mipMapsPreserveCoverage: 0
    alphaTestReferenceValue: 0.5
    mipMapFadeDistanceStart: 1
    mipMapFadeDistanceEnd: 3
  bumpmap:
    convertToNormalMap: 0
    externalNormalMap: 0
    heightScale: 0.25
    normalMapFilter: 0
  isReadable: 0
  streamingMipmaps: 0
  streamingMipmapsPriority: 0
  grayScaleToAlpha: 0
  generateCubemap: 6
  cubemapConvolution: 0
  seamlessCubemap: 0
  textureFormat: 1
  maxTextureSize: 2048
  textureSettings:
    serializedVersion: 2
    filterMode: 1
    aniso: 1
    mipBias: 0
    wrapU: 1
    wrapV: 1
    wrapW: 1
  nPOTScale: 0
  lightmap: 0
  compressionQuality: 50
  spriteMode: 1
  spriteExtrude: 1
  spriteMeshType: ${o.rig ? 1 : 0}
  alignment: 9
  spritePivot: {x: ${n(o.px)}, y: ${n(o.py)}}
  spritePixelsToUnits: ${n(o.ppu)}
  spriteBorder: {x: 0, y: 0, z: 0, w: 0}
  spriteGenerateFallbackPhysicsShape: 0
  alphaUsage: 1
  alphaIsTransparency: 1
  spriteTessellationDetail: -1
  textureType: 8
  textureShape: 1
  singleChannelComponent: 0
  maxTextureSizeSet: 0
  compressionQualitySet: 0
  textureFormatSet: 0
  platformSettings:
  - serializedVersion: 3
    buildTarget: DefaultTexturePlatform
    maxTextureSize: 2048
    resizeAlgorithm: 0
    textureFormat: -1
    textureCompression: 0
    compressionQuality: 50
    crunchedCompression: 0
    allowsAlphaSplitting: 0
    overridden: 0
  spriteSheet:
    serializedVersion: 2
    sprites: []
    outline: []
    physicsShape: []
    bones: []
    spriteID: ${o.spriteId}
    internalID: 0
    vertices: []
    indices:
    edges: []
    weights: []
    secondaryTextures: []
  spritePackingTag:
  pSDRemoveMatte: 0
  userData: ${o.rig ? ystr('storyboard-rig:' + JSON.stringify(o.rig)) : ''}
  assetBundleName:
  assetBundleVariant:
`,
  };
  const HEAD = '%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n';
  const NONE = '{fileID: 0}';
  const ref = id => `{fileID: ${id}}`;
  const ext = (fid, guid, type) => `{fileID: ${fid}, guid: ${guid}, type: ${type}}`;

  // ---------- the editor helper (sprite bones and weights) and its assembly
  const RIG_CS = `// Toonzi 2D: gives the exported sprites that bend with a rig their bones and weights.
// The exporter stores them in each sprite's import settings; this applies them once through Unity's
// sprite data API (so they also show in the Skinning Editor), then clears them. Needs 2D Sprite and
// 2D Animation (Window > Package Manager). Run it again from Tools > Toonzi 2D > Set Up Sprite Rigs.
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.U2D.Sprites;
using UnityEngine;
using UnityEngine.U2D;

namespace StoryboardStudio.EditorTools
{
    [Serializable] class RigBone { public string name; public string guid; public float x; public float y; public float angle; public float length; public int parent; }
    [Serializable] class RigData { public RigBone[] bones; public float[] verts; public int[] tris; public int[] edges; public int[] boneIndex; public float[] boneWeight; }

    class StoryboardRigSetup : AssetPostprocessor
    {
        const string Tag = "storyboard-rig:";
        const string Label = "StoryboardRig";

        [InitializeOnLoadMethod]
        static void OnLoad() { EditorApplication.delayCall += ApplyPending; }

        static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            foreach (var p in imported)
            {
                var ti = AssetImporter.GetAtPath(p) as TextureImporter;
                if (ti != null && ti.userData != null && ti.userData.StartsWith(Tag)) { EditorApplication.delayCall -= ApplyPending; EditorApplication.delayCall += ApplyPending; return; }
            }
        }

        [MenuItem("Tools/Toonzi 2D/Set Up Sprite Rigs")]
        static void ApplyPending()
        {
            var factory = new SpriteDataProviderFactories();
            factory.Init();
            foreach (var guid in AssetDatabase.FindAssets("l:" + Label))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var ti = AssetImporter.GetAtPath(path) as TextureImporter;
                if (ti == null || string.IsNullOrEmpty(ti.userData) || !ti.userData.StartsWith(Tag)) continue;
                try { Apply(factory, ti, JsonUtility.FromJson<RigData>(ti.userData.Substring(Tag.Length))); }
                catch (Exception e) { Debug.LogWarning("Toonzi 2D: couldn't set up the rig of " + path + ": " + e.Message); continue; }
                ti.userData = "";
                ti.SaveAndReimport();
                var asset = AssetDatabase.LoadMainAssetAtPath(path);
                if (asset != null)
                {
                    var labels = new List<string>(AssetDatabase.GetLabels(asset));
                    labels.Remove(Label);
                    AssetDatabase.SetLabels(asset, labels.ToArray());
                }
            }
        }

        static void Apply(SpriteDataProviderFactories factory, TextureImporter ti, RigData d)
        {
            var dp = factory.GetSpriteEditorDataProviderFromObject(ti);
            dp.InitSpriteEditorDataProvider();
            var rects = dp.GetSpriteRects();
            if (rects == null || rects.Length == 0) return;
            var id = rects[0].spriteID;

            var bones = new List<SpriteBone>();
            foreach (var b in d.bones)
                bones.Add(new SpriteBone { name = b.name, guid = b.guid, position = new Vector3(b.x, b.y, 0f), rotation = Quaternion.Euler(0f, 0f, b.angle), length = b.length, parentId = b.parent, color = new Color32(255, 140, 40, 255) });
            dp.GetDataProvider<ISpriteBoneDataProvider>().SetBones(id, bones);

            var mesh = dp.GetDataProvider<ISpriteMeshDataProvider>();
            int count = d.verts.Length / 2;
            var verts = new Vertex2DMetaData[count];
            for (int i = 0; i < count; i++)
            {
                verts[i].position = new Vector2(d.verts[i * 2], d.verts[i * 2 + 1]);
                var w = new BoneWeight();
                w.boneIndex0 = d.boneIndex[i * 4]; w.weight0 = d.boneWeight[i * 4];
                w.boneIndex1 = d.boneIndex[i * 4 + 1]; w.weight1 = d.boneWeight[i * 4 + 1];
                w.boneIndex2 = d.boneIndex[i * 4 + 2]; w.weight2 = d.boneWeight[i * 4 + 2];
                w.boneIndex3 = d.boneIndex[i * 4 + 3]; w.weight3 = d.boneWeight[i * 4 + 3];
                verts[i].boneWeight = w;
            }
            mesh.SetVertices(id, verts);
            mesh.SetIndices(id, d.tris);
            var edges = new Vector2Int[d.edges.Length / 2];
            for (int i = 0; i < edges.Length; i++) edges[i] = new Vector2Int(d.edges[i * 2], d.edges[i * 2 + 1]);
            mesh.SetEdges(id, edges);
            dp.Apply();
        }
    }
}
`;
  /** A controller that drives the rig, in the Scene view and in the game: moving it poses what it drives, like in
      Toonzi 2D. It blends a grid of poses recorded with the controller at each spot of its box (or line). */
  const CTRL_CS = `// Toonzi 2D: a controller that drives the rig, in the editor and in the game.
// Move this GameObject (drag it in the Scene view, animate it, or set its localPosition from your own
// scripts) and what it drives follows, like in Toonzi 2D. It blends the poses recorded with the
// controller at each spot of its box or line (row by row from the top) and sets them after the Animator,
// so it also works while the exported animations play: with "adds" (parts & 8) the change goes on top of
// the animation, otherwise it replaces it. Drawings it switches (sprites, shown or hidden, fading) take the
// nearest spot. Its box is a gizmo: you see it in the editor only.
using System.Globalization;
using UnityEngine;

[ExecuteAlways]
[DisallowMultipleComponent]
[DefaultExecutionOrder(1000)]
public class StoryboardController : MonoBehaviour
{
    [Tooltip("What this controller moves.")]
    public Transform[] targets;
    [Tooltip("Per target: 1 position, 2 rotation, 4 scale, 8 adds to the animation, 16 snaps to the nearest spot (added together).")]
    public int[] parts;
    [Tooltip("x y rotationZ scaleX scaleY per target, for each spot of the grid.")]
    [TextArea(1, 3)] public string poses;
    [Tooltip("Drawings this controller switches.")]
    public SpriteRenderer[] renderers;
    public Sprite[] sprites;
    [Tooltip("Per spot, per renderer: sprite index, alpha, shown (-1 leaves it as it is).")]
    [TextArea(1, 3)] public string looks;
    public int columns = 1;
    public int rows = 1;
    public Vector2 halfSize = Vector2.one;
    public Vector3 rest;
    [Range(0f, 1f)] public float weight = 1f;

    float[] data, look;
    string parsedPoses, parsedLooks;
    // what the controller wrote last time, and what was there before it: so an added change never piles up
    Vector3[] lastPos, basePos, lastScale, baseScale;
    float[] lastRot, baseRot;
    bool[] wrote;

    void LateUpdate() { Apply(); }
#if UNITY_EDITOR
    // In the editor (not playing), Unity only updates when it repaints: follow the controller as you drag it, and on any change
    void OnEnable() { UnityEditor.EditorApplication.update -= EditorTick; UnityEditor.EditorApplication.update += EditorTick; }
    void OnDisable() { UnityEditor.EditorApplication.update -= EditorTick; }
    void OnValidate() { parsedPoses = null; parsedLooks = null; if (!Application.isPlaying && isActiveAndEnabled) Apply(); }
    Vector3 lastSeen = new Vector3(float.NaN, 0f, 0f);
    void EditorTick()
    {
        if (this == null || Application.isPlaying || !isActiveAndEnabled) return;
        if (transform.localPosition == lastSeen) return;
        lastSeen = transform.localPosition; Apply();
        UnityEditor.SceneView.RepaintAll();
    }
#endif

    /// <summary>Pose what it drives for where the controller is now.</summary>
    public void Apply()
    {
        if (weight <= 0f) return;
        int cols = Mathf.Max(1, columns), rws = Mathf.Max(1, rows);
        Vector3 p = transform.localPosition;
        float u = halfSize.x > 0f ? Mathf.Clamp((p.x - rest.x) / halfSize.x, -1f, 1f) : 0f;
        float v = halfSize.y > 0f ? Mathf.Clamp((rest.y - p.y) / halfSize.y, -1f, 1f) : 0f; // rows go down, like the stage
        float fx = (u + 1f) * 0.5f * (cols - 1), fy = (v + 1f) * 0.5f * (rws - 1);
        ApplyPoses(cols, rws, fx, fy);
        ApplyLooks(cols, rws, fx, fy);
    }

    void ApplyPoses(int cols, int rws, float fx, float fy)
    {
        if (targets == null || targets.Length == 0 || parts == null) return;
        if (data == null || !ReferenceEquals(parsedPoses, poses)) { data = Parse(poses); parsedPoses = poses; }
        int n = targets.Length;
        if (data.Length < cols * rws * n * 5) return;
        if (wrote == null || wrote.Length != n)
        {
            lastPos = new Vector3[n]; basePos = new Vector3[n]; lastScale = new Vector3[n]; baseScale = new Vector3[n];
            lastRot = new float[n]; baseRot = new float[n]; wrote = new bool[n];
        }
        float fx0 = 0.5f * (cols - 1), fy0 = 0.5f * (rws - 1); // the controller at rest
        for (int i = 0; i < n && i < parts.Length; i++)
        {
            Transform t = targets[i];
            if (t == null) continue;
            float x, y, r, sx, sy, cx, cy, cr, csx, csy;
            int pt = parts[i];
            if ((pt & 16) != 0) Sample(cols, rws, Mathf.Round(fx), Mathf.Round(fy), i, out x, out y, out r, out sx, out sy); // snaps: the nearest spot
            else Sample(cols, rws, fx, fy, i, out x, out y, out r, out sx, out sy);
            if ((pt & 8) != 0)
            {
                Sample(cols, rws, fx0, fy0, i, out cx, out cy, out cr, out csx, out csy);
                if ((pt & 1) != 0)
                {
                    Vector3 cur = t.localPosition, b = wrote[i] && cur == lastPos[i] ? basePos[i] : cur;
                    basePos[i] = b; t.localPosition = b + new Vector3(x - cx, y - cy, 0f) * weight; lastPos[i] = t.localPosition;
                }
                if ((pt & 2) != 0)
                {
                    float cur = t.localEulerAngles.z, b = wrote[i] && Mathf.Abs(Mathf.DeltaAngle(cur, lastRot[i])) < 0.001f ? baseRot[i] : cur;
                    baseRot[i] = b; t.localRotation = Quaternion.Euler(0f, 0f, b + Mathf.DeltaAngle(cr, r) * weight); lastRot[i] = t.localEulerAngles.z;
                }
                if ((pt & 4) != 0)
                {
                    Vector3 cur = t.localScale, b = wrote[i] && cur == lastScale[i] ? baseScale[i] : cur;
                    float kx = Mathf.Abs(csx) > 1e-5f ? sx / csx : 1f, ky = Mathf.Abs(csy) > 1e-5f ? sy / csy : 1f;
                    baseScale[i] = b; t.localScale = new Vector3(b.x * Mathf.Lerp(1f, kx, weight), b.y * Mathf.Lerp(1f, ky, weight), b.z); lastScale[i] = t.localScale;
                }
                wrote[i] = true;
                continue;
            }
            if ((pt & 1) != 0) { Vector3 lp = t.localPosition; t.localPosition = Vector3.Lerp(lp, new Vector3(x, y, lp.z), weight); }
            if ((pt & 2) != 0) t.localRotation = Quaternion.Slerp(t.localRotation, Quaternion.Euler(0f, 0f, r), weight);
            if ((pt & 4) != 0) { Vector3 ls = t.localScale; t.localScale = Vector3.Lerp(ls, new Vector3(sx, sy, ls.z), weight); }
        }
    }

    /// <summary>The values of target i blended from the four spots around (fx, fy).</summary>
    void Sample(int cols, int rws, float fx, float fy, int i, out float x, out float y, out float r, out float sx, out float sy)
    {
        int c0 = Mathf.Min(Mathf.FloorToInt(fx), Mathf.Max(cols - 2, 0)), c1 = Mathf.Min(c0 + 1, cols - 1);
        int r0 = Mathf.Min(Mathf.FloorToInt(fy), Mathf.Max(rws - 2, 0)), r1 = Mathf.Min(r0 + 1, rws - 1);
        float kx = fx - c0, ky = fy - r0;
        int s00 = r0 * cols + c0, s01 = r0 * cols + c1, s10 = r1 * cols + c0, s11 = r1 * cols + c1;
        float w00 = (1f - kx) * (1f - ky), w01 = kx * (1f - ky), w10 = (1f - kx) * ky, w11 = kx * ky;
        float a0 = Val(s00, i, 2);
        x = w00 * Val(s00, i, 0) + w01 * Val(s01, i, 0) + w10 * Val(s10, i, 0) + w11 * Val(s11, i, 0);
        y = w00 * Val(s00, i, 1) + w01 * Val(s01, i, 1) + w10 * Val(s10, i, 1) + w11 * Val(s11, i, 1);
        r = a0 + w01 * Mathf.DeltaAngle(a0, Val(s01, i, 2)) + w10 * Mathf.DeltaAngle(a0, Val(s10, i, 2)) + w11 * Mathf.DeltaAngle(a0, Val(s11, i, 2));
        sx = w00 * Val(s00, i, 3) + w01 * Val(s01, i, 3) + w10 * Val(s10, i, 3) + w11 * Val(s11, i, 3);
        sy = w00 * Val(s00, i, 4) + w01 * Val(s01, i, 4) + w10 * Val(s10, i, 4) + w11 * Val(s11, i, 4);
    }

    float Val(int s, int i, int k) { return data[(s * targets.Length + i) * 5 + k]; }

    void ApplyLooks(int cols, int rws, float fx, float fy)
    {
        if (renderers == null || renderers.Length == 0) return;
        if (look == null || !ReferenceEquals(parsedLooks, looks)) { look = Parse(looks); parsedLooks = looks; }
        int m = renderers.Length;
        if (look.Length < cols * rws * m * 3) return;
        int s = Mathf.Clamp(Mathf.RoundToInt(fy), 0, rws - 1) * cols + Mathf.Clamp(Mathf.RoundToInt(fx), 0, cols - 1); // switches take the nearest spot
        for (int j = 0; j < m; j++)
        {
            SpriteRenderer sr = renderers[j];
            if (sr == null) continue;
            int b = (s * m + j) * 3, si = (int)look[b];
            if (sprites != null && si >= 0 && si < sprites.Length && sr.sprite != sprites[si]) sr.sprite = sprites[si];
            if (look[b + 1] >= 0f) { Color c = sr.color; c.a = Mathf.Lerp(c.a, look[b + 1], weight); sr.color = c; }
            if (look[b + 2] >= 0f) { bool on = look[b + 2] > 0.5f; if (sr.gameObject.activeSelf != on) sr.gameObject.SetActive(on); }
        }
    }

    static float[] Parse(string text)
    {
        string[] bits = (text ?? "").Split((char[])null, System.StringSplitOptions.RemoveEmptyEntries); // split on any white space
        float[] d = new float[bits.Length];
        for (int i = 0; i < bits.Length; i++) float.TryParse(bits[i], NumberStyles.Float, CultureInfo.InvariantCulture, out d[i]);
        return d;
    }

    [Header("How it is drawn in the Scene view")]
    [Tooltip("0 its box or line, 1 a circle, 2 just the knob (it moves freely).")]
    public int look = 0;
    public Color color = new Color(1f, 0.55f, 0.1f, 0.95f);
    public string label = "";

    // Its box (or line, or circle) and its knob, in the Scene view (Gizmos on), selected or not, so you can find it and drag it
    void OnDrawGizmos()
    {
        Gizmos.matrix = transform.parent != null ? transform.parent.localToWorldMatrix : Matrix4x4.identity;
        Gizmos.color = color;
        float k = Mathf.Max(0.06f, Mathf.Max(halfSize.x, halfSize.y) * 0.07f);
        if (look == 1) { const int N = 48; for (int i = 0; i < N; i++) { float a = i * Mathf.PI * 2f / N, b = (i + 1) * Mathf.PI * 2f / N; Gizmos.DrawLine(rest + new Vector3(Mathf.Cos(a) * halfSize.x, Mathf.Sin(a) * halfSize.y, 0f), rest + new Vector3(Mathf.Cos(b) * halfSize.x, Mathf.Sin(b) * halfSize.y, 0f)); } }
        else if (look != 2)
        {
            float w = columns > 1 ? halfSize.x : 0f, h = rows > 1 ? halfSize.y : 0f;
            if (w > 0f && h > 0f) Gizmos.DrawWireCube(rest, new Vector3(w * 2f, h * 2f, 0f));
            else if (w > 0f) { Gizmos.DrawLine(rest - new Vector3(w, 0f, 0f), rest + new Vector3(w, 0f, 0f)); Gizmos.DrawLine(rest + new Vector3(-w, -k, 0f), rest + new Vector3(-w, k, 0f)); Gizmos.DrawLine(rest + new Vector3(w, -k, 0f), rest + new Vector3(w, k, 0f)); } // left–right
            else if (h > 0f) { Gizmos.DrawLine(rest - new Vector3(0f, h, 0f), rest + new Vector3(0f, h, 0f)); Gizmos.DrawLine(rest + new Vector3(-k, -h, 0f), rest + new Vector3(k, -h, 0f)); Gizmos.DrawLine(rest + new Vector3(-k, h, 0f), rest + new Vector3(k, h, 0f)); } // up–down
        }
        Gizmos.DrawSphere(transform.localPosition, k);
        Gizmos.color = Color.white; Gizmos.DrawWireSphere(transform.localPosition, k * 1.3f);
#if UNITY_EDITOR
        if (!string.IsNullOrEmpty(label)) { Gizmos.matrix = Matrix4x4.identity; Vector3 at = (transform.parent != null ? transform.parent.TransformPoint(rest + new Vector3(-halfSize.x, halfSize.y, 0f)) : rest + new Vector3(-halfSize.x, halfSize.y, 0f)); UnityEditor.Handles.color = color; UnityEditor.Handles.Label(at, label); }
#endif
    }
}
`;
  const RIG_ASMDEF = JSON.stringify({ name: 'StoryboardStudio.Editor', rootNamespace: '', references: ['Unity.2D.Sprite.Editor'], includePlatforms: ['Editor'], excludePlatforms: [], allowUnsafeCode: false, overrideReferences: false, precompiledReferences: [], autoReferenced: false, defineConstraints: ['STORYBOARD_SPRITE_API'], versionDefines: [{ name: 'com.unity.2d.sprite', expression: '1.0.0', define: 'STORYBOARD_SPRITE_API' }], noEngineReferences: false }, null, 4);
  const SPRITE_SKIN_GUID = '57c008f954fe54a8bb972de1018a2cb8'; // UnityEngine.U2D.Animation.SpriteSkin (2D Animation)

  // ================= build
  async function build(screens, opt) {
    const G = await E.collect(screens, opt), fps = G.fps, base = opt.base || 'animation', title = fileName(opt.title || base), warnings = new Set(G.warnings);
    if (opt.prog) opt.prog(0.75, 'Building the Unity package…');
    const W0 = G.w, H0 = G.h, UNIT = 100; // 100 px = 1 unit
    const root = 'Assets/' + title, assets = []; // { path, data (Uint8Array|string), meta }
    const asset = async (path, data, metaFn) => { const g = await guidOf(base + '|' + path); assets.push({ path, data, meta: metaFn(g), guid: g }); return g; };
    const folder = async path => asset(path, null, META.folder);
    // shared helper scripts live in one place (Assets/StoryboardStudio) with fixed GUIDs, so importing several exports never duplicates them
    const shared = async (path, data, metaFn) => { const g = await guidOf('sb-shared|' + path); if (!assets.some(a => a.path === path)) assets.push({ path, data, meta: metaFn(g), guid: g }); return g; };
    const SHARED = 'Assets/StoryboardStudio';
    await folder(root); const spritesFolder = await folder(root + '/Sprites'); await folder(root + '/Animations');
    // a Sprite Atlas holding the Sprites folder: Unity packs every picture into shared textures (fewer draw calls), in builds and play mode
    await asset(`${root}/${fileName(title)} Atlas.spriteatlas`, `${HEAD}--- !u!687078895 &4343727234628468602\nSpriteAtlas:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_Name: ${ystr(fileName(title) + ' Atlas')}\n  m_EditorData:\n    serializedVersion: 2\n    textureSettings:\n      serializedVersion: 2\n      anisoLevel: 0\n      compressionQuality: 50\n      maxTextureSize: 4096\n      textureCompression: 0\n      filterMode: 1\n      generateMipMaps: 0\n      readable: 0\n      crunchedCompression: 0\n      sRGB: 1\n    platformSettings: []\n    packingSettings:\n      serializedVersion: 2\n      padding: 4\n      blockOffset: 1\n      allowAlphaSplitting: 0\n      enableRotation: 0\n      enableTightPacking: 0\n      enableAlphaDilation: 0\n    secondaryTextureSettings: {}\n    variantMultiplier: 1\n    packables:\n    - {fileID: 102900000, guid: ${spritesFolder}, type: 3}\n    bindAsDefault: 1\n    isAtlasV2: 0\n    cachedData: {fileID: 0}\n  m_MasterAtlas: {fileID: 0}\n  m_PackedSprites: []\n  m_PackedSpriteNamesToIndex: []\n  m_RenderDataMap: {}\n  m_Tag: ${ystr(fileName(title) + ' Atlas')}\n  m_IsVariant: 0\n`, gg => META.native(gg, '4343727234628468602'));

    // ---------- conversion: stage pixels (y down) → Unity units (y up), the screen's middle at 0
    const L = m => new DOMMatrix([m.a, -m.b, -m.c, m.d, m.e / UNIT, -m.f / UNIT]); // L·m·L⁻¹ for a local matrix
    const ROOTW = new DOMMatrix().translateSelf(W0 / 2, H0 / 2); // what the prefab root is, in stage pixels
    const trs = (W, P) => B.decompose(L(E.local(W, P || ROOTW)));

    // ---------- the GameObject tree
    const objs = []; // { key, name, parent, kids, nd, world(c,i), fid: { go, tr, ... } }
    const byKey = new Map(), rootObj = { name: goName(title), kids: [], comps: [], path: '', world: () => ROOTW };
    const mk = (parent, name, extra) => { const used = parent.used || (parent.used = new Set()); let nm = goName(name), i = 2; while (used.has(nm)) nm = `${goName(name)} ${i++}`; used.add(nm); const o = Object.assign({ name: nm, parent, kids: [], comps: [] }, extra); o.path = parent === rootObj ? nm : `${parent.path}/${nm}`; parent.kids.push(o); objs.push(o); return o; };
    const kids = new Map(); for (const nd of G.nodes) { const p = nd.parent && G.byKey.has(nd.parent) ? nd.parent : null; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(nd); }
    const trackW = key => (c, i) => { const t = c.tracks.get(key); return t && t.W[i]; };
    // bones first, so riding layers can hang on them
    const joints = G.nodes.filter(j => j.kind === 'joint');
    function place(nd, parent) {
      if (nd.kind === 'joint') return;
      if (nd.kind === 'rig') {
        const r = mk(parent, nd.name, { nd, world: trackW(nd.key) }); byKey.set(nd.key, r);
        const addJ = (j, par) => { const o = mk(par, j.name, { nd: j, world: trackW(j.key), bone: true }); byKey.set(j.key, o); joints.filter(x => x.parent === j.key).forEach(x => addJ(x, o)); };
        joints.filter(j => j.parent === nd.key).forEach(j => addJ(j, r)); return;
      }
      if (nd.kind === 'ctrl') { byKey.set(nd.key, mk(parent, nd.name, { nd, world: trackW(nd.key) })); return; }
      if (nd.kind === 'group') { const g = mk(parent, nd.name, { nd, world: trackW(nd.key) }); byKey.set(nd.key, g); (kids.get(nd.key) || []).forEach(c => place(c, g)); return; }
      if (nd.kind === 'layer' && nd.pics.length) byKey.set(nd.key, mk(parent, nd.name, { nd, world: nd.skin ? (c, i) => trackW(nd.key)(c, i) && nd.skin.M0 : trackW(nd.key), layer: true }));
    }
    // rigs and controllers before layers (so a layer riding on a bone finds it)
    const top = kids.get(null) || [];
    const placeAll = (list, parent) => list.forEach(nd => place(nd, parent));
    placeAll(top, rootObj);
    // riding layers move under their bone
    for (const o of objs.slice()) if (o.layer && o.nd.follow && byKey.has(o.nd.follow) && !o.nd.skin) {
      const bone = byKey.get(o.nd.follow); o.parent.kids.splice(o.parent.kids.indexOf(o), 1); o.parent.used.delete(o.name);
      const used = bone.used || (bone.used = new Set()); let nm = o.name, i = 2; while (used.has(nm)) nm = `${o.name} ${i++}`; used.add(nm); o.name = nm; o.parent = bone; bone.kids.push(o);
    }
    const fixPaths = o => { for (const k of o.kids) { k.path = o === rootObj ? k.name : `${o.path}/${k.name}`; fixPaths(k); } }; fixPaths(rootObj);
    const firstWorld = o => { for (const c of G.clips) for (let i = 0; i < c.n; i++) { const W = o.world(c, i); if (W) return W; } return null; };
    const worldOf = (o, c, i) => o === rootObj ? ROOTW : o.world(c, i) || firstWorld(o) || worldOf(o.parent, c, i);
    const localAt = (o, c, i) => { const W = o.world(c, i); return W ? trs(W, worldOf(o.parent, c, i)) : null; };

    // ---------- sprites (one per layer frame)
    const sortOrder = new Map(); [...G.order].reverse().forEach((k, i) => sortOrder.set(k, i * 2)); // back = 0
    const spriteRef = new Map(), usedFiles = new Set(); // `${key}:${f}` → guid
    const uniqueFile = (dir, nm, extn) => { let p = `${dir}/${nm}${extn}`, i = 2; while (usedFiles.has(p.toLowerCase())) p = `${dir}/${nm} ${i++}${extn}`; usedFiles.add(p.toLowerCase()); return p; };
    for (const o of objs) if (o.layer) {
      const nd = o.nd, pics = nd.skin ? [nd.skin.pic] : nd.pics;
      for (const pic of pics) {
        const k = pic.k, h = pic.h, ppu = UNIT * k, file = uniqueFile(`${root}/Sprites`, `${fileName(o.name)}${pics.length > 1 ? ' ' + SB.engines.picName(pic) : ''}`, '.png');
        const meta = { px: -pic.x0 / pic.w, py: (pic.y0 + pic.h) / pic.h, ppu, spriteId: (await guidOf('sprite|' + base + '|' + file)) };
        if (nd.skin) meta.rig = rigData(nd.skin, pic, o);
        const g = await asset(file, G.png(pic), gg => META.sprite(gg, meta)); spriteRef.set(`${nd.key}:${pic.f}`, g); void h;
      }
    }
    function rigData(s, pic, o) {
      const k = pic.k, Sx = x => (x - pic.x0) * k, Sy = y => (pic.y0 + pic.h - y) * k, M0i = s.M0.inverse();
      // sprite bones in hierarchy order (parents first)
      const depth = key => { let d = 0, j = G.byKey.get(key); while (j && j.kind === 'joint') { d++; j = G.byKey.get(j.parent); } return d; };
      const orderJ = s.joints.map((key, i) => ({ key, i })).sort((a, b) => depth(a.key) - depth(b.key)), remap = new Map(orderJ.map((x, ni) => [x.i, ni]));
      const frames = orderJ.map(({ key, i }) => { const m = M0i.multiply(s.binds[i]); return { key, x: Sx(m.e), y: Sy(m.f), ang: Math.atan2(-m.b, m.a) * 180 / Math.PI }; });
      const bones = frames.map((fr, bi) => {
        let pk = G.byKey.get(fr.key).parent, pi = -1; while (pk && G.byKey.get(pk) && G.byKey.get(pk).kind === 'joint') { const at = frames.findIndex(x => x.key === pk); if (at >= 0) { pi = at; break; } pk = G.byKey.get(pk).parent; }
        const j = G.byKey.get(fr.key), len = Math.max(1, (j.len || 10) * k);
        if (pi < 0) return { name: j.name, guid: '', x: fr.x, y: fr.y, angle: fr.ang, length: len, parent: -1 };
        const p = frames[pi], a = -p.ang * Math.PI / 180, dx = fr.x - p.x, dy = fr.y - p.y;
        return { name: j.name, guid: '', x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a), angle: fr.ang - p.ang, length: len, parent: pi };
      });
      bones.forEach((b, i) => { b.guid = hex(te.encode((o.name + '/' + b.name + '/' + i).padEnd(16, '#'))).slice(0, 32); b.x = Math.round(b.x * 1000) / 1000; b.y = Math.round(b.y * 1000) / 1000; b.angle = Math.round(b.angle * 1000) / 1000; b.length = Math.round(b.length * 1000) / 1000; });
      const verts = [], boneIndex = [], boneWeight = [];
      s.verts.forEach(([x, y], vi) => { verts.push(Math.round(Sx(x) * 100) / 100, Math.round(Sy(y) * 100) / 100); const w = s.weights[vi].map(([j, x2]) => [remap.get(j), x2]).sort((a, b) => b[1] - a[1]); for (let q = 0; q < 4; q++) { boneIndex.push(w[q] ? w[q][0] : 0); boneWeight.push(w[q] ? Math.round(w[q][1] * 10000) / 10000 : 0); } });
      o.skinBones = orderJ.map(x => x.key);
      return { bones, verts, tris: s.tris, edges: s.edges.flat(), boneIndex, boneWeight };
    }

    // ---------- file ids
    for (const o of [rootObj, ...objs]) { const id = o === rootObj ? 'root' : (o.nd ? o.nd.key : o.path); o.go = await fileIdOf(base + '|go|' + id + '|' + o.path); o.tr = await fileIdOf(base + '|tr|' + id + '|' + o.path); }

    // ---------- clips: which values move in any screen (those get keys in every clip)
    const props = new Map(), series = [];
    G.clips.forEach((c, ci) => {
      const m = new Map(); series.push(m);
      for (const o of objs) {
        const tr = o.nd && c.tracks.get(o.nd.key), Ls = [], vis = [], a = [], fi = [];
        for (let i = 0; i < c.n; i++) { Ls.push(o.nd && o.nd.skin ? null : localAt(o, c, i)); vis.push(!!(tr && tr.on[i])); a.push(tr ? U.clamp(tr.a[i] || 0, 0, 1) : 0); fi.push(tr ? tr.fi[i] || 0 : 0); }
        m.set(o, { L: E.filled(Ls), vis, a, fi, here: !!tr });
      }
    });
    // what moves in the animations (controller pose grids don't count: they live in their StoryboardController, and the
    // controllers themselves must stay free to move while an animation plays)
    const anim = series.filter((s, ci) => !G.clips[ci].pose);
    const L0 = new Map(objs.map(o => { for (const s of anim) { const l = s.get(o).L.find(Boolean); if (l) return [o, l]; } return [o, o.nd && o.nd.skin ? trs(o.nd.skin.M0, worldOf(o.parent, G.clips[0], 0)) : { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }]; }));
    for (const o of objs) {
      const P = new Set(), l0 = L0.get(o); props.set(o, P);
      for (const s of anim) {
        const v = s.get(o), Lf = v.L.map(l => l || l0);
        if (Lf.some(l => Math.abs(l.x - l0.x) > 1e-4 || Math.abs(l.y - l0.y) > 1e-4)) P.add('pos'); if (Lf.some(l => Math.abs(l.rot - l0.rot) > 0.01)) P.add('rot'); if (Lf.some(l => Math.abs(l.sx - l0.sx) > 1e-4 || Math.abs(l.sy - l0.sy) > 1e-4)) P.add('scale');
        if (o.layer) { if (v.vis.some(x => !x)) P.add('active'); if (v.a.some((x, i) => v.vis[i] && Math.abs(x - 1) > 0.004)) P.add('alpha'); if (!o.nd.skin && o.nd.pics.length > 1 && (new Set(v.fi.filter((f, i) => v.vis[i])).size > 1 || (G.clips[series.indexOf(s)].tracks.get(o.nd.key) || {}).fev)) P.add('sprite'); }
      }
    }
    // ---------- controllers that drive something: their grid of poses becomes a table on a StoryboardController
    const poseClips = G.clips.map((c, ci) => c.pose ? ci : -1).filter(ci => ci >= 0);
    const ctrlScript = objs.some(o => o.nd && o.nd.kind === 'ctrl') ? await guidOf('sb-shared|' + SHARED + '/StoryboardController.cs') : null; // every controller gets it (so it shows in the Scene view)
    const ctrlLook = o => { const c = o.nd.o, mo = c.ctype === 'custom' && c.lock ? c.lock : c.ctype || 'xy', col = B.rgba(c.color || '#FF8A1F'); return `  look: ${mo === 'free' ? 2 : c.ctype === 'custom' && c.cshape === 'circle' && mo !== 'x' && mo !== 'y' ? 1 : 0}\n  color: {r: ${n(col[0])}, g: ${n(col[1])}, b: ${n(col[2])}, a: 0.95}\n  label: ${ystr(c.label || c.name)}\n`; };
    // ---------- prefab
    const doc = []; const D = (cls, id, body) => doc.push(`--- !u!${cls} &${id}\n${body}`);
    const comp = (o, cls, id) => o.comps.push({ cls, id });
    const masksByGroup = new Map(); for (const o of objs) if (o.layer && o.nd.mask) masksByGroup.set(o.nd.parent, o);
    const leavesUnder = key => { const out = []; (function w(k) { for (const nd of G.nodes) if (nd.parent === k) { if (nd.kind === 'layer') out.push(nd.key); else if (nd.kind === 'group') w(nd.key); } })(key); return out; };
    const maskInteraction = new Map();
    for (const [gk, mo] of masksByGroup) for (const lk of leavesUnder(gk)) if (lk !== mo.nd.key) maskInteraction.set(lk, { mode: mo.nd.mask.mode === 'out' ? 2 : 1, mask: mo });
    const controllerGuid = await guidOf(base + '|' + `${root}/${title}.controller`);
    const rendererBase = (o, fid, order, mats) => `  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_GameObject: ${ref(o.go)}\n  m_Enabled: 1\n  m_CastShadows: 0\n  m_ReceiveShadows: 0\n  m_DynamicOccludee: 1\n  m_MotionVectors: 1\n  m_LightProbeUsage: 1\n  m_ReflectionProbeUsage: 1\n  m_RenderingLayerMask: 1\n  m_RendererPriority: 0\n  m_Materials:\n  - {fileID: ${mats}, guid: 0000000000000000f000000000000000, type: 0}\n  m_StaticBatchInfo:\n    firstSubMesh: 0\n    subMeshCount: 0\n  m_StaticBatchRoot: {fileID: 0}\n  m_ProbeAnchor: {fileID: 0}\n  m_LightProbeVolumeOverride: {fileID: 0}\n  m_SortingLayerID: 0\n  m_SortingLayer: 0\n  m_SortingOrder: ${order}\n`;
    for (const o of objs) {
      if (!o.layer) continue; const nd = o.nd, first = series[0].get(o), f0 = nd.skin ? nd.skin.pic.f : (first.here ? first.fi.find((f, i) => first.vis[i]) ?? nd.pics[0].f : nd.pics[0].f);
      const sg = spriteRef.get(`${nd.key}:${f0}`) || spriteRef.get(`${nd.key}:${nd.pics[0].f}`), pic = (nd.skin ? nd.skin.pic : nd.pics.find(p => p.f === f0)) || nd.pics[0], order = sortOrder.get(nd.key) || 0;
      if (nd.mask) {
        // the mask: a SpriteMask over the layers of its group (sorting range); a visible mask also draws its shape
        const ids = leavesUnder(nd.parent).filter(k => k !== nd.key).map(k => (sortOrder.get(k) || 0) + 1), front = ids.length ? Math.max(...ids) : order + 1, back = ids.length ? Math.min(...ids) - 1 : order;
        const mid = await fileIdOf(base + '|mask|' + nd.key); comp(o, 331, mid);
        D(331, mid, `SpriteMask:\n${rendererBase(o, mid, order, 10758)}  m_Sprite: ${ext(21300000, sg, 3)}\n  m_MaskAlphaCutoff: 0.2\n  m_FrontSortingLayerID: 0\n  m_BackSortingLayerID: 0\n  m_FrontSortingLayer: 0\n  m_BackSortingLayer: 0\n  m_FrontSortingOrder: ${front}\n  m_BackSortingOrder: ${back}\n  m_IsCustomRangeActive: 1\n  m_SpriteSortPoint: 0\n`);
        if (nd.mask.visible) { const sh = mk(o, 'Mask shape', { shape: true }); sh.path = `${o.path}/${sh.name}`; sh.go = await fileIdOf(base + '|go|shape|' + nd.key); sh.tr = await fileIdOf(base + '|tr|shape|' + nd.key); const rid = await fileIdOf(base + '|sr|shape|' + nd.key); comp(sh, 212, rid);
          D(212, rid, `SpriteRenderer:\n${rendererBase(sh, rid, back, 10754)}  m_Sprite: ${ext(21300000, sg, 3)}\n  m_Color: {r: 1, g: 1, b: 1, a: 1}\n  m_FlipX: 0\n  m_FlipY: 0\n  m_DrawMode: 0\n  m_Size: {x: ${n(pic.w / UNIT)}, y: ${n(pic.h / UNIT)}}\n  m_AdaptiveModeThreshold: 0.5\n  m_SpriteTileMode: 0\n  m_WasSpriteAssigned: 1\n  m_MaskInteraction: 0\n  m_SpriteSortPoint: 0\n`); }
        continue;
      }
      const rid = await fileIdOf(base + '|sr|' + nd.key); comp(o, 212, rid); o.sr = rid; const mi = maskInteraction.get(nd.key);
      D(212, rid, `SpriteRenderer:\n${rendererBase(o, rid, order + 1, 10754)}  m_Sprite: ${ext(21300000, sg, 3)}\n  m_Color: {r: 1, g: 1, b: 1, a: ${n(first.here && first.vis[0] ? first.a[0] : 1)}}\n  m_FlipX: 0\n  m_FlipY: 0\n  m_DrawMode: 0\n  m_Size: {x: ${n(pic.w / UNIT)}, y: ${n(pic.h / UNIT)}}\n  m_AdaptiveModeThreshold: 0.5\n  m_SpriteTileMode: 0\n  m_WasSpriteAssigned: 1\n  m_MaskInteraction: ${mi ? mi.mode : 0}\n  m_SpriteSortPoint: 0\n`);
      if (nd.skin && o.skinBones) {
        const sid = await fileIdOf(base + '|skin|' + nd.key), bones = o.skinBones.map(k => byKey.get(k)).filter(Boolean); comp(o, 114, sid);
        const rootBone = bones.find(b => !bones.includes(b.parent)) || bones[0];
        D(114, sid, `MonoBehaviour:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_GameObject: ${ref(o.go)}\n  m_Enabled: 1\n  m_EditorHideFlags: 0\n  m_Script: ${ext(11500000, SPRITE_SKIN_GUID, 3)}\n  m_Name: \n  m_EditorClassIdentifier: \n  m_RootBone: ${ref(rootBone.tr)}\n  m_BoneTransforms:\n${bones.map(b => `  - ${ref(b.tr)}`).join('\n')}\n  m_Bounds:\n    m_Center: {x: ${n((pic.x0 + pic.w / 2) / UNIT)}, y: ${n(-(pic.y0 + pic.h / 2) / UNIT)}, z: 0}\n    m_Extent: {x: ${n(pic.w / UNIT)}, y: ${n(pic.h / UNIT)}, z: 0}\n  m_UseBatching: 1\n  m_AlwaysUpdate: 1\n  m_AutoRebind: 0\n`);
      }
    }
    // controllers that drive something: what they move, and how, at each spot of their box
    for (const ci of poseClips) {
      const c = G.clips[ci], o = byKey.get(c.pose.key); if (!o) continue; const l = L0.get(o) || { x: 0, y: 0 }, PW = worldOf(o.parent, G.clips[0], 0), ps = Math.hypot(PW.a, PW.b) || 1, ser = series[ci];
      const targets = [], parts = [], vals = [], owner = t => t.nd && (t.nd.o || (t.nd.rig && G.byKey.get(t.nd.rig) && G.byKey.get(t.nd.rig).o)), flags = t => { const o = owner(t), P = c.pose; return (o ? ((P.addIds || []).includes(o.id) ? 8 : 0) : (P.add ? 8 : 0)) | (o && (P.snapIds || []).includes(o.id) ? 16 : 0); };
      for (const t of objs) {
        if (t === o || !t.nd || t.nd.kind === 'ctrl' || t.shape || (t.nd.skin && !t.bone)) continue; const Ls = ser.get(t) && ser.get(t).L; if (!Ls || !Ls[0]) continue;
        const a = Ls[0], pr = (Ls.some(q => Math.abs(q.x - a.x) > 1e-4 || Math.abs(q.y - a.y) > 1e-4) ? 1 : 0) | (Ls.some(q => Math.abs(((q.rot - a.rot + 540) % 360) - 180) > 0.01) ? 2 : 0) | (Ls.some(q => Math.abs(q.sx - a.sx) > 1e-4 || Math.abs(q.sy - a.sy) > 1e-4) ? 4 : 0);
        if (pr) { targets.push(t); parts.push(pr | flags(t)); }
      }
      for (let i = 0; i < c.n; i++) for (const t of targets) { const q = ser.get(t).L[i]; vals.push(n(q.x), n(q.y), n(q.rot), n(q.sx), n(q.sy)); }
      // drawings it switches: their picture, fading, shown or hidden (-1: left as it is)
      const rends = [], spr = [], looks = [];
      for (const t of objs) {
        if (!t.sr || !t.layer || t === o) continue; const v = ser.get(t); if (!v || !v.here) continue;
        const sw = !t.nd.skin && t.nd.pics.length > 1 && new Set(v.fi.filter((f, i) => v.vis[i])).size > 1, fade = v.a.some((x, i) => v.vis[i] && Math.abs(x - v.a[0]) > 0.004), show = v.vis.some(x => x !== v.vis[0]);
        if (sw || fade || show) rends.push({ t, sw, fade, show, v });
      }
      for (let i = 0; i < c.n; i++) for (const R of rends) {
        let si = -1; if (R.sw && R.v.vis[i]) { const g = spriteRef.get(`${R.t.nd.key}:${R.v.fi[i]}`); if (g) { si = spr.indexOf(g); if (si < 0) si = spr.push(g) - 1; } }
        looks.push(si, R.fade && R.v.vis[i] ? n(R.v.a[i]) : -1, R.show ? (R.v.vis[i] ? 1 : 0) : -1);
      }
      const id = await fileIdOf(base + '|ctrl|' + c.pose.key); comp(o, 114, id); // (one that only switches nothing still shows in the Scene view)
      const arr = a => a.length ? '\n' + a.map(x => `  - ${x}`).join('\n') : ' []';
      D(114, id, `MonoBehaviour:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_GameObject: ${ref(o.go)}\n  m_Enabled: 1\n  m_EditorHideFlags: 0\n  m_Script: ${ext(11500000, ctrlScript, 3)}\n  m_Name: \n  m_EditorClassIdentifier: \n  targets:${arr(targets.map(t => ref(t.tr)))}\n  parts:${arr(parts)}\n  poses: '${vals.join(' ')}'\n  renderers:${arr(rends.map(R => ref(R.t.sr)))}\n  sprites:${arr(spr.map(g => ext(21300000, g, 3)))}\n  looks: '${looks.join(' ')}'\n  columns: ${c.pose.nx}\n  rows: ${c.pose.ny}\n  halfSize: {x: ${n(c.pose.rw / UNIT / ps)}, y: ${n(c.pose.rh / UNIT / ps)}}\n  rest: {x: ${n(l.x)}, y: ${n(l.y)}, z: 0}\n  weight: 1\n${ctrlLook(o)}`);
      o.ctrlComp = true;
    }
    // controllers that drive nothing (or move freely): the same script, weight 0, so they show and can be dragged in the Scene view
    for (const o of objs) {
      if (!o.nd || o.nd.kind !== 'ctrl' || o.ctrlComp) continue; const c = o.nd.o, l = L0.get(o) || { x: 0, y: 0 }, PW = worldOf(o.parent, G.clips[0], 0), ps = Math.hypot(PW.a, PW.b) || 1, mo = c.ctype === 'custom' && c.lock ? c.lock : c.ctype || 'xy';
      const id = await fileIdOf(base + '|ctrl|' + o.nd.key); comp(o, 114, id);
      D(114, id, `MonoBehaviour:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_GameObject: ${ref(o.go)}\n  m_Enabled: 1\n  m_EditorHideFlags: 0\n  m_Script: ${ext(11500000, ctrlScript, 3)}\n  m_Name: \n  m_EditorClassIdentifier: \n  targets: []\n  parts: []\n  poses: ''\n  renderers: []\n  sprites: []\n  looks: ''\n  columns: ${mo === 'y' ? 1 : 9}\n  rows: ${mo === 'x' ? 1 : 9}\n  halfSize: {x: ${n((c.rw ?? c.range ?? 100) / UNIT / ps)}, y: ${n((c.rh ?? c.range ?? 100) / UNIT / ps)}}\n  rest: {x: ${n(l.x)}, y: ${n(l.y)}, z: 0}\n  weight: 0\n${ctrlLook(o)}`);
      o.ctrlComp = true;
    }
    // Animator on the root
    const anId = await fileIdOf(base + '|animator'); comp(rootObj, 95, anId);
    D(95, anId, `Animator:\n  serializedVersion: 3\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_GameObject: ${ref(rootObj.go)}\n  m_Enabled: 1\n  m_Avatar: {fileID: 0}\n  m_Controller: ${ext(9100000, controllerGuid, 2)}\n  m_CullingMode: 0\n  m_UpdateMode: 0\n  m_ApplyRootMotion: 0\n  m_LinearVelocityBlending: 0\n  m_WarningMessage: \n  m_HasTransformHierarchy: 1\n  m_AllowConstantClipSamplingOptimization: 1\n  m_KeepAnimatorControllerStateOnDisable: 0\n`);
    // GameObjects and Transforms
    const all = [rootObj]; (function w(o) { for (const k of o.kids) { all.push(k); w(k); } })(rootObj);
    for (const o of all) {
      const l = o === rootObj || o.shape ? { x: 0, y: 0, rot: 0, sx: 1, sy: 1 } : L0.get(o), s0 = o.layer ? series[0].get(o) : null, active = !s0 || (s0.here && s0.vis[0]);
      const ang = l.rot * Math.PI / 180, qz = Math.sin(ang / 2), qw = Math.cos(ang / 2);
      D(1, o.go, `GameObject:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  serializedVersion: 6\n  m_Component:\n  - component: ${ref(o.tr)}\n${o.comps.map(c => `  - component: ${ref(c.id)}`).join('\n')}${o.comps.length ? '\n' : ''}  m_Layer: 0\n  m_Name: ${ystr(o.name)}\n  m_TagString: Untagged\n  m_Icon: {fileID: 0}\n  m_NavMeshLayer: 0\n  m_StaticEditorFlags: 0\n  m_IsActive: ${active ? 1 : 0}\n`);
      D(4, o.tr, `Transform:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_GameObject: ${ref(o.go)}\n  serializedVersion: 2\n  m_LocalRotation: {x: 0, y: 0, z: ${n(qz)}, w: ${n(qw)}}\n  m_LocalPosition: {x: ${n(l.x)}, y: ${n(l.y)}, z: 0}\n  m_LocalScale: {x: ${n(l.sx)}, y: ${n(l.sy)}, z: 1}\n  m_ConstrainProportionsScale: 0\n  m_Children:${o.kids.length ? '\n' + o.kids.map(k => `  - ${ref(k.tr)}`).join('\n') : ' []'}\n  m_Father: ${o === rootObj ? NONE : ref(o.parent.tr)}\n  m_LocalEulerAnglesHint: {x: 0, y: 0, z: ${n(l.rot)}}\n`);
    }
    // GameObject documents first, then transforms, then the rest (Unity's own order; any order loads)
    const prefabText = HEAD + doc.sort((a, b) => rankDoc(a) - rankDoc(b)).join('');
    const prefabPath = `${root}/${title}.prefab`, prefabGuid = await asset(prefabPath, prefabText, META.prefab);

    // ---------- animation clips
    const clipGuids = [];
    for (let ci = 0; ci < G.clips.length; ci++) {
      const c = G.clips[ci]; if (c.pose) continue; // controller poses live in their StoryboardController
      const path = uniqueFile(`${root}/Animations`, fileName(c.name), '.anim'), sname = path.slice(path.lastIndexOf('/') + 1, -5);
      const g = await asset(path, clipText(c, series[ci], sname), gg => META.native(gg, 7400000)); clipGuids.push({ g, name: sname, dur: c.dur });
    }
    function clipText(c, m, name) {
      const end = arr => arr.concat([arr[arr.length - 1]]), tAt = i => Math.min(i, c.n) / fps;
      const vec3 = [], euler = [], scale = [], floats = [], pptr = [], edF = [], edE = [], bind = [], mapping = [];
      const linKeys = (vals, tol) => { const k = B.simplify(vals.map(v => Array.isArray(v) ? v : [v]), tol); return k.map((i, j) => { const prev = k[j - 1], next = k[j + 1], v = vals[i], s = (a, b) => (Array.isArray(v) ? v.map((_, d) => (vals[b][d] - vals[a][d]) / (tAt(b) - tAt(a))) : (vals[b] - vals[a]) / (tAt(b) - tAt(a))); const inS = prev != null ? s(prev, i) : next != null ? s(i, next) : (Array.isArray(v) ? v.map(() => 0) : 0), outS = next != null ? s(i, next) : inS; return { t: tAt(i), v, inS, outS }; }); };
      const v3 = a => `{x: ${n(a[0])}, y: ${n(a[1])}, z: ${n(a[2])}}`;
      const key3 = k => `      - serializedVersion: 3\n        time: ${n(k.t)}\n        value: ${v3(k.v)}\n        inSlope: ${v3(k.inS)}\n        outSlope: ${v3(k.outS)}\n        tangentMode: 0\n        weightedMode: 0\n        inWeight: {x: 0.33333334, y: 0.33333334, z: 0.33333334}\n        outWeight: {x: 0.33333334, y: 0.33333334, z: 0.33333334}\n`;
      const key1 = (k, step) => `      - serializedVersion: 3\n        time: ${n(k.t)}\n        value: ${n(k.v)}\n        inSlope: ${step ? 'Infinity' : n(k.inS)}\n        outSlope: ${step ? 'Infinity' : n(k.outS)}\n        tangentMode: ${step ? 103 : 69}\n        weightedMode: 0\n        inWeight: 0\n        outWeight: 0\n`;
      const curveV = (keys, path) => `  - curve:\n      serializedVersion: 2\n      m_Curve:\n${keys.map(key3).join('')}      m_PreInfinity: 2\n      m_PostInfinity: 2\n      m_RotationOrder: 4\n    path: ${ystr(path)}\n`;
      const curveF = (keys, attr, path, cls, step) => `  - curve:\n      serializedVersion: 2\n      m_Curve:\n${keys.map(k => key1(k, step)).join('')}      m_PreInfinity: 2\n      m_PostInfinity: 2\n      m_RotationOrder: 4\n    attribute: ${attr}\n    path: ${ystr(path)}\n    classID: ${cls}\n    script: {fileID: 0}\n`;
      const gb = (path, attr, typeID, pptr, custom = 0) => bind.push(`    - serializedVersion: 2\n      path: ${crc32(path)}\n      attribute: ${attr}\n      script: {fileID: 0}\n      typeID: ${typeID}\n      customType: ${custom}\n      isPPtrCurve: ${pptr ? 1 : 0}\n`);
      for (const o of objs) {
        if (c.pose && o.nd && o.nd.kind === 'ctrl') continue; // a pose never moves the controllers
        const P = props.get(o), s = m.get(o); if (!P || !P.size) continue; const l0 = L0.get(o), Ls = end(s.L.map(l => l || l0));
        if (P.has('pos')) { const k = linKeys(Ls.map(l => [l.x, l.y, 0]), 1e-4); vec3.push(curveV(k, o.path)); ['x', 'y', 'z'].forEach((a, d) => edF.push(curveF(k.map(x => ({ t: x.t, v: x.v[d], inS: x.inS[d], outS: x.outS[d] })), `m_LocalPosition.${a}`, o.path, 4))); gb(o.path, 1, 4); }
        if (P.has('rot')) { const r = B.unwrap(Ls.map(l => l.rot)), k = linKeys(r.map(z => [0, 0, z]), 0.01); euler.push(curveV(k, o.path)); ['x', 'y', 'z'].forEach((a, d) => { const ks = k.map(x => ({ t: x.t, v: x.v[d], inS: x.inS[d], outS: x.outS[d] })); edF.push(curveF(ks, `localEulerAnglesRaw.${a}`, o.path, 4)); edE.push(curveF(ks, `m_LocalEulerAngles.${a}`, o.path, 4)); }); gb(o.path, 4, 4); }
        if (P.has('scale')) { const k = linKeys(Ls.map(l => [l.sx, l.sy, 1]), 1e-4); scale.push(curveV(k, o.path)); ['x', 'y', 'z'].forEach((a, d) => edF.push(curveF(k.map(x => ({ t: x.t, v: x.v[d], inS: x.inS[d], outS: x.outS[d] })), `m_LocalScale.${a}`, o.path, 4))); gb(o.path, 3, 4); }
        if (P.has('active')) { const vis = end(s.vis), ks = vis.map((v, i) => i).filter(i => i === 0 || i === vis.length - 1 || vis[i] !== vis[i - 1]).map(i => ({ t: tAt(i), v: vis[i] ? 1 : 0 })); const cv = curveF(ks, 'm_IsActive', o.path, 1, true); floats.push(cv); edF.push(cv); gb(o.path, crc32('m_IsActive'), 1); }
        if (P.has('alpha') && o.sr) { const k = linKeys(end(s.a), 0.002); const cv = curveF(k, 'm_Color.a', o.path, 212); floats.push(cv); edF.push(cv); gb(o.path, crc32('m_Color.a'), 212); }
        if (P.has('sprite') && o.sr) {
          const ks = E.picKeys(c.tracks.get(o.nd.key), c.n, fps).concat([[c.n / fps, null]]); ks[ks.length - 1][1] = ks[ks.length - 2][1]; // morph in-betweens at their own moments; a last key holds to the end
          const items = ks.map(([t, f]) => { const g = spriteRef.get(`${o.nd.key}:${f}`) || spriteRef.get(`${o.nd.key}:${o.nd.pics[0].f}`); mapping.push(`    - ${ext(21300000, g, 3)}`); return `    - time: ${n(t)}\n      value: ${ext(21300000, g, 3)}\n`; });
          pptr.push(`  - curve:\n${items.join('')}    attribute: m_Sprite\n    path: ${ystr(o.path)}\n    classID: 212\n    script: {fileID: 0}\n`); gb(o.path, 0, 212, true, 23);
        }
      }
      const list = a => a.length ? '\n' + a.join('') : ' []\n';
      return `${HEAD}--- !u!74 &7400000\nAnimationClip:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_Name: ${ystr(name)}\n  serializedVersion: 6\n  m_Legacy: 0\n  m_Compressed: 0\n  m_UseHighQualityCurve: 1\n  m_RotationCurves: []\n  m_CompressedRotationCurves: []\n  m_EulerCurves:${list(euler)}  m_PositionCurves:${list(vec3)}  m_ScaleCurves:${list(scale)}  m_FloatCurves:${list(floats)}  m_PPtrCurves:${list(pptr)}  m_SampleRate: ${fps}\n  m_WrapMode: 0\n  m_Bounds:\n    m_Center: {x: 0, y: 0, z: 0}\n    m_Extent: {x: 0, y: 0, z: 0}\n  m_ClipBindingConstant:\n    genericBindings:${list(bind)}    pptrCurveMapping:${mapping.length ? '\n' + mapping.join('\n') + '\n' : ' []\n'}  m_AnimationClipSettings:\n    serializedVersion: 2\n    m_AdditiveReferencePoseClip: {fileID: 0}\n    m_AdditiveReferencePoseTime: 0\n    m_StartTime: 0\n    m_StopTime: ${n(c.dur)}\n    m_OrientationOffsetY: 0\n    m_Level: 0\n    m_CycleOffset: 0\n    m_HasAdditiveReferencePose: 0\n    m_LoopTime: 1\n    m_LoopBlend: 0\n    m_LoopBlendOrientation: 0\n    m_LoopBlendPositionY: 0\n    m_LoopBlendPositionXZ: 0\n    m_KeepOriginalOrientation: 0\n    m_KeepOriginalPositionY: 1\n    m_KeepOriginalPositionXZ: 0\n    m_HeightFromFeet: 0\n    m_Mirror: 0\n  m_EditorCurves:${list(edF)}  m_EulerEditorCurves:${list(edE)}  m_HasGenericRootTransform: 0\n  m_HasMotionFloatCurves: 0\n  m_Events: []\n`;
    }

    // ---------- animator controller: one state per screen, the first plays by default
    const smId = await fileIdOf(base + '|sm'), states = await Promise.all(clipGuids.map(async (c, i) => ({ id: await fileIdOf(base + '|state|' + i + c.name), c })));
    let ctl = `${HEAD}--- !u!91 &9100000\nAnimatorController:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_Name: ${ystr(title)}\n  serializedVersion: 5\n  m_AnimatorParameters: []\n  m_AnimatorLayers:\n  - serializedVersion: 5\n    m_Name: Base Layer\n    m_StateMachine: ${ref(smId)}\n    m_Mask: {fileID: 0}\n    m_Motions: []\n    m_Behaviours: []\n    m_BlendingMode: 0\n    m_SyncedLayerIndex: -1\n    m_DefaultWeight: 0\n    m_IKPass: 0\n    m_SyncedLayerAffectsTiming: 0\n    m_Controller: {fileID: 9100000}\n`;
    states.forEach(({ id, c }, i) => { ctl += `--- !u!1102 &${id}\nAnimatorState:\n  serializedVersion: 6\n  m_ObjectHideFlags: 1\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_Name: ${ystr(c.name)}\n  m_Speed: 1\n  m_CycleOffset: 0\n  m_Transitions: []\n  m_StateMachineBehaviours: []\n  m_Position: {x: 50, y: ${50 + i * 60}, z: 0}\n  m_IKOnFeet: 0\n  m_WriteDefaultValues: 1\n  m_Mirror: 0\n  m_SpeedParameterActive: 0\n  m_MirrorParameterActive: 0\n  m_CycleOffsetParameterActive: 0\n  m_TimeParameterActive: 0\n  m_Motion: ${ext(7400000, c.g, 2)}\n  m_Tag: \n  m_SpeedParameter: \n  m_MirrorParameter: \n  m_CycleOffsetParameter: \n  m_TimeParameter: \n`; });
    ctl += `--- !u!1107 &${smId}\nAnimatorStateMachine:\n  serializedVersion: 6\n  m_ObjectHideFlags: 1\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_Name: Base Layer\n  m_ChildStates:\n${states.map(({ id }, i) => `  - serializedVersion: 1\n    m_State: ${ref(id)}\n    m_Position: {x: 300, y: ${60 + i * 60}, z: 0}\n`).join('')}  m_ChildStateMachines: []\n  m_AnyStateTransitions: []\n  m_EntryTransitions: []\n  m_StateMachineTransitions: {}\n  m_StateMachineBehaviours: []\n  m_AnyStatePosition: {x: 50, y: 20, z: 0}\n  m_EntryPosition: {x: 50, y: 120, z: 0}\n  m_ExitPosition: {x: 800, y: 120, z: 0}\n  m_ParentStateMachinePosition: {x: 800, y: 20, z: 0}\n  m_DefaultState: ${ref(states[0].id)}\n`;
    const ctlGuid = await asset(`${root}/${title}.controller`, ctl, gg => META.native(gg, 9100000)); if (ctlGuid !== controllerGuid) throw new Error('controller guid');

    // ---------- a scene: the prefab and an orthographic camera on the screen
    const bg = SB.bake.rgba(screens[0].proj.bg || '#ffffff'), camGo = await fileIdOf(base + '|camgo'), camTr = await fileIdOf(base + '|camtr'), cam = await fileIdOf(base + '|cam'), inst = await fileIdOf(base + '|inst');
    const scene = `${HEAD}--- !u!29 &1\nOcclusionCullingSettings:\n  m_ObjectHideFlags: 0\n  serializedVersion: 2\n  m_OcclusionBakeSettings:\n    smallestOccluder: 5\n    smallestHole: 0.25\n    backfaceThreshold: 100\n  m_SceneGUID: 00000000000000000000000000000000\n  m_OcclusionCullingData: {fileID: 0}\n--- !u!104 &2\nRenderSettings:\n  m_ObjectHideFlags: 0\n  serializedVersion: 9\n  m_Fog: 0\n  m_AmbientMode: 3\n  m_SkyboxMaterial: {fileID: 0}\n--- !u!1 &${camGo}\nGameObject:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  serializedVersion: 6\n  m_Component:\n  - component: ${ref(camTr)}\n  - component: ${ref(cam)}\n  m_Layer: 0\n  m_Name: Main Camera\n  m_TagString: MainCamera\n  m_Icon: {fileID: 0}\n  m_NavMeshLayer: 0\n  m_StaticEditorFlags: 0\n  m_IsActive: 1\n--- !u!4 &${camTr}\nTransform:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_GameObject: ${ref(camGo)}\n  serializedVersion: 2\n  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}\n  m_LocalPosition: {x: 0, y: 0, z: -10}\n  m_LocalScale: {x: 1, y: 1, z: 1}\n  m_ConstrainProportionsScale: 0\n  m_Children: []\n  m_Father: {fileID: 0}\n  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}\n--- !u!20 &${cam}\nCamera:\n  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n  m_GameObject: ${ref(camGo)}\n  m_Enabled: 1\n  serializedVersion: 2\n  m_ClearFlags: 2\n  m_BackGroundColor: {r: ${n(bg[0])}, g: ${n(bg[1])}, b: ${n(bg[2])}, a: 1}\n  m_projectionMatrixMode: 1\n  m_NormalizedViewPortRect:\n    serializedVersion: 2\n    x: 0\n    y: 0\n    width: 1\n    height: 1\n  near clip plane: 0.3\n  far clip plane: 1000\n  field of view: 60\n  orthographic: 1\n  orthographic size: ${n(H0 / 2 / UNIT)}\n  m_Depth: -1\n  m_CullingMask:\n    serializedVersion: 2\n    m_Bits: 4294967295\n  m_RenderingPath: -1\n  m_TargetTexture: {fileID: 0}\n  m_TargetDisplay: 0\n  m_TargetEye: 3\n  m_HDR: 1\n  m_AllowMSAA: 1\n  m_AllowDynamicResolution: 0\n  m_ForceIntoRT: 0\n  m_OcclusionCulling: 1\n  m_StereoConvergence: 10\n  m_StereoSeparation: 0.022\n--- !u!1001 &${inst}\nPrefabInstance:\n  m_ObjectHideFlags: 0\n  serializedVersion: 2\n  m_Modification:\n    serializedVersion: 3\n    m_TransformParent: {fileID: 0}\n    m_Modifications:\n    - target: ${ext(rootObj.go, prefabGuid, 3)}\n      propertyPath: m_Name\n      value: ${ystr(rootObj.name)}\n      objectReference: {fileID: 0}\n    m_RemovedComponents: []\n    m_RemovedGameObjects: []\n    m_AddedGameObjects: []\n    m_AddedComponents: []\n  m_SourcePrefab: ${ext(100100000, prefabGuid, 3)}\n--- !u!1660057539 &9223372036854775807\nSceneRoots:\n  m_ObjectHideFlags: 0\n  m_Roots:\n  - ${ref(camTr)}\n  - ${ref(inst)}\n`;
    await asset(`${root}/${title}.unity`, scene, gg => META.plain(gg, 'DefaultImporter'));
    // the rig helper, only when something bends
    const skinned = objs.some(o => o.nd && o.nd.skin);
    const ctrls = objs.some(o => o.ctrlComp);
    if (skinned || ctrls) await shared(SHARED, null, META.folder);
    if (skinned) {
      await shared(SHARED + '/Editor', null, META.folder);
      await shared(SHARED + '/Editor/StoryboardRigSetup.cs', RIG_CS, META.script);
      await shared(SHARED + '/Editor/StoryboardStudio.Editor.asmdef', RIG_ASMDEF, gg => META.plain(gg, 'AssemblyDefinitionImporter'));
    }
    if (ctrls) await shared(SHARED + '/StoryboardController.cs', CTRL_CS, META.script);
    await asset(`${root}/README.txt`, readme(title, clipGuids.map(c => c.name), objs), gg => META.plain(gg, 'TextScriptImporter'));

    // ---------- the package
    if (opt.prog) opt.prog(0.92, 'Packing…');
    const entries = [];
    for (const a of assets) {
      entries.push({ name: `${a.guid}/pathname`, data: te.encode(a.path) }, { name: `${a.guid}/asset.meta`, data: te.encode(a.meta) });
      if (a.data != null) entries.push({ name: `${a.guid}/asset`, data: typeof a.data === 'string' ? te.encode(a.data) : a.data });
    }
    const blob = await gzip(tar(entries));
    const tips = G.nodes.some(nd => nd.skin) ? ['Bending layers use Sprite Skin: the Unity project needs the 2D Animation package (Window › Package Manager).'] : [];
    return { files: [{ name: `${U.slug(base)}.unitypackage`, blob }], warnings: [...warnings], tips };
  }
  const rankDoc = d => { const m = d.match(/^--- !u!(\d+)/), c = m ? +m[1] : 0; return c === 1 ? 0 : c === 4 ? 1 : 2; };
  const readme = (title, clips, objs) => `${title}: exported from Toonzi 2D for Unity (2022.3 or newer).

Open ${title}.unity, or drag ${title}.prefab into your scene. Its Animator has one state per screen:
${clips.map(c => '  - ' + c).join('\n')}
Play one from a script: GetComponent<Animator>().Play("${clips[0]}");

Layers are SpriteRenderers (Order in Layer follows the layer order), masks are Sprite Masks,
${objs.some(o => o.bone) ? 'bones are GameObjects under the rig (move or rotate them to pose it), ' : ''}controllers are empty GameObjects.
Controllers that drive something have a StoryboardController: move them (drag them in the Scene view, in Play mode
too, animate them or set their position from a script) and the rig follows, like in Toonzi 2D. Their box
shows as a gizmo, so you see them in the editor and not in the game.
${objs.some(o => o.nd && o.nd.skin) ? 'Layers that bend with the rig use Sprite Skin (2D Animation package). If they show unbent, run\nTools > Toonzi 2D > Set Up Sprite Rigs once.\n' : ''}100 pixels = 1 unit.
`;
  SB.unity = { build, crc32, tar };
})(window.SB);
