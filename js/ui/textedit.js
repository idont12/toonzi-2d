/* Typing straight onto the stage: an invisible textarea sits exactly over the text layer. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, X = SB.xf;
  let ed = null;
  const TE = SB.textEdit = {
    active: () => !!ed,
    start(o) {
      TE.end(); if (!o || o.type !== 'text' || !tree.inRange(o) || tree.locked(o)) return;
      if (S.sel !== o.id) tree.select([o.id]);
      const fr = SB.frames.current(o), own = !!fr && fr.text != null, ta = U.h('textarea.txed', { spellcheck: 'false', 'aria-label': 'Edit text' });
      ta.value = own ? fr.text : o.text; U.$('#stageWrap').appendChild(ta); ed = { o, ta, own }; S.textEdit = o.id; TE.place(); ta.focus(); ta.select();
      ta.addEventListener('input', () => { if (!ed) return; if (ed.own) SB.frames.current(o).text = ta.value; else o.text = ta.value; SB.bump(); TE.place(); });
      ta.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); TE.end(); } });
      ta.addEventListener('pointerdown', ev => ev.stopPropagation());
      ta.addEventListener('blur', () => setTimeout(() => { if (ed && ed.ta === ta) TE.end(); }, 0));
      SB.dirty();
    },
    place() {
      if (!ed) return; const { o, ta } = ed; if (!tree.find(o.id) || !tree.inRange(o)) return TE.end();
      const v = SB.scene.viewOf(o, tree.localTime(o)), ti = SB.text.info(v, SB.frames.current(o)), M = X.world(o), wr = U.$('#stageWrap').getBoundingClientRect(), r = SB.view.rect(), k = r.width / S.project.w;
      const sc = U.matScale(M) * k, c = M.transformPoint(U.pt(0, 0)), f = SB.text.fontDef(v.font), wgt = v.weight || (v.bold ? f[2] : f[1]);
      const Wd = Math.max(ti.w * sc, v.fontSize * sc * 0.6) + 2, Hd = ti.h * sc;
      Object.assign(ta.style, { left: (r.left - wr.left + c.x * k - Wd / 2) + 'px', top: (r.top - wr.top + c.y * k - Hd / 2) + 'px', width: Wd + 'px', height: Hd + 'px', font: `${wgt} ${v.fontSize * sc}px ${f[0]}`, lineHeight: ti.lh * sc + 'px', textAlign: v.talign || 'center', transform: `rotate(${U.matAngle(M)}deg)` });
      ta.dir = (v.tdir || 'auto') === 'auto' ? 'auto' : v.tdir;
    },
    end() { if (!ed) return; const { ta } = ed; ed = null; S.textEdit = null; ta.remove(); SB.commit(); },
  };
})(window.SB);
