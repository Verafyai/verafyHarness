import json, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.text as _mt
_oi=_mt.Text.__init__
def _ni(self,*a,**k):
    k.setdefault('parse_math',False); _oi(self,*a,**k)
_mt.Text.__init__=_ni
from matplotlib.patches import Rectangle
E_=json.load(open("econ.json"))
bg="#05080d"; sf="#0e141b"; bd="#232c36"; tx="#dfe5eb"; mu="#9aa6b2"; teal="#5fe0c8"; amber="#e0b45f"; red="#f28b82"; vio="#8b93ff"; dim="#3f8f80"
plt.rcParams.update({"font.family":"Inter","font.size":16,"text.color":tx,"axes.labelcolor":mu,"xtick.color":mu,"ytick.color":mu})
def frame(title,sub):
    fig=plt.figure(figsize=(16,9),dpi=100); fig.patch.set_facecolor(bg)
    fig.text(0.05,0.92,title,fontsize=34,fontweight="bold",color="#fff")
    fig.text(0.05,0.875,sub,fontsize=18,color=mu)
    return fig
import textwrap
def foot(fig,s): fig.text(0.05,0.025,"\n".join(textwrap.fill(p,178) for p in s.split("\n")),fontsize=12,color=mu,linespacing=1.5)
def style(ax):
    ax.set_facecolor(bg)
    for s in ax.spines.values(): s.set_color(bd)
    ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
def tag(ax,x,y,t,c):
    ax.text(x,y,t,fontsize=11,color=c,ha="center",va="center",bbox=dict(boxstyle="square,pad=0.3",fc=bg,ec=c,lw=1))

# ---------- 1. FlashProve today
fig=frame("Proving one AI answer is possible now. It isn't cheap.",
 "FlashProve (Anthropic, open source, Nov 2026) proves inference for one model. Here is what one proof costs, as reported.")
tiles=[("9.3 s","of H100 per proof","223 s per batch of 24"),("70 to 95x","inference GPU time","proving overhead"),
       ("18.78 MB","per proof","for a few hundred words"),("17 s","to verify one proof","on 24 CPU threads"),
       ("1,024","tokens per proof","about 750 words, a hard cap"),("1 model","Llama 4 Maverick only","no family diversity yet")]
for i,(big,a,b) in enumerate(tiles):
    x=0.05+(i%3)*0.155; y=0.53-(i//3)*0.25
    fig.patches.append(Rectangle((x,y),0.145,0.22,transform=fig.transFigure,fc=sf,ec=bd,lw=1))
    fig.text(x+0.012,y+0.13,big,fontsize=32,fontweight="bold",color=teal)
    fig.text(x+0.012,y+0.075,a,fontsize=14,color=tx); fig.text(x+0.012,y+0.035,b,fontsize=12,color=mu)
ax=fig.add_axes([0.58,0.2,0.38,0.58]); style(ax)
vals=[0.0033,E_["unpacked"]["pc"]]; labs=["Unproven ruling\n5 jurors, 5 labs","Proven ruling\n5 jurors each prove"]
b=ax.bar(labs,vals,color=[teal,red],width=0.55)
for r,v,t in zip(b,vals,["$0.0033","$0.109"]): ax.text(r.get_x()+r.get_width()/2,v*1.03,t,ha="center",fontsize=22,fontweight="bold",color="#fff")
ax.set_ylim(0,0.13); ax.set_yticks([]); ax.tick_params(axis="x",labelsize=14)
tag(ax,0,0.025,"measured",teal); tag(ax,1,0.06,"modeled",red)
ax.text(0.5,0.125,"Proof turns a third of a cent into eleven cents: 33x",ha="center",fontsize=16,color=tx)
foot(fig,"Tiles: vendor-reported, FlashProve README and examples/maverick/figures.txt (commit 9e2bdd8, read Nov 6, 2026). Measured: five live Verafy rulings, $0.0163 total (results/live-2026-11-06.md).\nModeled: packages/economics, 1,000 contracts, H100 at $4.00/hour, two verifiers per proof, proofs kept 3 months. All in: proving, verifying, storage, warm-up.")
fig.savefig("slides/1-flashprove-today.png",facecolor=bg); plt.close(fig)

# ---------- 2. Waterfall
pc=[E_[k]["pc"] for k in ["unpacked","briefs","atoms","dedupe","screen"]]
prec=0.5*pc[-1]+0.5*0.0004; pc.append(prec)
steps=["One proof per\njuror per contract","Prove once,\ncompressed briefs\n4 per proof","Atomize into\nyes/no questions\n16 per proof","Dedupe shared\nquestions\n(49%)","Fast screen\nsettles half\n(Jev)","Precedent cache\nanswers half\n(no rate measured)"]
lab=["modeled","modeled","modeled","modeled","modeled, assumed shares","illustrative"]
fig=frame("Packing takes a proven ruling from 11 cents to under half a cent.",
 "Cost per contract, all in, for a block of 1,000 contracts. Each step keeps the one before it. Log scale.")
ax=fig.add_axes([0.07,0.27,0.9,0.55]); style(ax)
cols=[red,amber,teal,teal,teal,dim]
b=ax.bar(range(6),pc,color=cols,width=0.62); ax.set_yscale("log"); ax.set_ylim(0.0008,0.4)
for i,(r,v) in enumerate(zip(b,pc)):
    ax.text(i,v*1.18,f"${v:.4f}" if v<0.01 else f"${v:.3f}",ha="center",fontsize=22,fontweight="bold",color="#fff")
    ax.text(i,v*1.75,"baseline" if i==0 else f"{pc[0]/v:.0f}x cheaper",ha="center",fontsize=14,color=mu)
    tag(ax,i,0.00105,lab[i],mu)
ax.set_xticks(range(6)); ax.set_xticklabels(steps,fontsize=13.5,color=tx); ax.set_yticks([])
foot(fig,"Modeled in packages/economics (harness.verafy.ai/economics). Atom slot 50 tokens and header 94 tokens, measured on packages/pack. Dedupe 49%: one test block, 120 atoms to 61 (measured, mock models).\nScreen: settles 50% of atoms and 70% of fidelity checks (assumed); Jev's $0.0004 a decision is vendor-reported. Precedent: half of queries answered from cache at screen cost; no hit rate measured yet.")
fig.savefig("slides/2-packing-waterfall.png",facecolor=bg); plt.close(fig)

# ---------- 3. time and data
ks=["unpacked","briefs","atoms","dedupe","screen"]; names=["One proof per juror","Briefs, prove once","Atomized","Deduped","Fast screen"]
fig=frame("Fewer proofs means a faster block and a smaller one.",
 "One block of 1,000 contracts, proven on a single H100. Packing shrinks every number, not just the bill.")
mets=[("Proofs to make",[E_[k]["proofs"] for k in ks],lambda v:f"{v:,}"),
      ("Minutes to seal, one H100",[E_[k]["seal"]/60 for k in ks],lambda v:f"{v:.0f}"),
      ("Proof data, GB",[E_[k]["gb"] for k in ks],lambda v:f"{v:.1f}" if v>=1 else f"{v:.2f}")]
for j,(t,vals,f) in enumerate(mets):
    ax=fig.add_axes([0.16+j*0.28,0.22,0.24,0.56]); style(ax)
    yy=range(len(vals))[::-1]
    ax.barh(list(yy),vals,color=[red,amber,teal,teal,teal],height=0.6)
    for y,v in zip(yy,vals): ax.text(v+max(vals)*0.02,y,f(v),va="center",fontsize=18,fontweight="bold",color="#fff")
    ax.set_xlim(0,max(vals)*1.35); ax.set_xticks([]); ax.set_yticks(list(yy)); ax.set_yticklabels(names if j==0 else [""]*5,fontsize=14,color=tx)
    ax.set_title(t,loc="left",fontsize=18,color=tx,pad=12)
    ax.text(0,-0.95,f"{vals[0]/vals[-1]:.0f}x less",fontsize=16,color=teal)
foot(fig,"All modeled, packages/economics, defaults as on slide 2. Seal time is the proving queue on one H100 including warm-up; more GPUs cut it roughly linearly (about 7 minutes of round trip on 6, VIP-0009).\nProof size 18.78 MB and 223 s per batch of 24 are FlashProve's vendor-reported figures.")
fig.savefig("slides/3-time-and-size.png",facecolor=bg); plt.close(fig)

# ---------- 4. where cost sits now
p=E_["screen"]["parts"]; order=[("Fidelity checks","fidelity",amber),("GPU warm-up","warmup",vio),("Fast screen","screening",dim),("Proving","proving",red),("Verifying","verifying","#f2b8b2"),("Storage","storing",mu)]
tot=sum(p.values())
fig=frame("After packing, the proof is no longer the expensive part.",
 "Where the $3.45 for a fully packed block of 1,000 contracts goes. Proving and verifying together are now 18%.")
ax=fig.add_axes([0.05,0.6,0.9,0.16]); style(ax); left=0
for n,k,c in order:
    w=p[k]; ax.barh(0,w,left=left,color=c,height=1,edgecolor=bg,lw=2)
    if w/tot>0.06: ax.text(left+w/2,0,f"{n}\n${w:.2f}  {w/tot:.0%}",ha="center",va="center",fontsize=14,color=bg,fontweight="bold")
    left+=w
ax.set_xlim(0,tot); ax.axis("off")
ax.text(tot,-0.85,f"Proving ${p['proving']:.2f}, verifying ${p['verifying']:.2f}, storage ${p['storing']:.2f}",ha="right",fontsize=13,color=mu)
pts=[("Fidelity checks are ordinary inference.","An unproven multi-family panel confirms each brief or atom plan matches the contract. That cost rides the inference curve: Epoch AI measures about 40x a year at fixed quality. At even 10x a year, this slice drops to $0.14 in a year."),
     ("Warm-up shrinks as blocks grow.","Loading weights costs the same for 30 proofs or 3,000. Bigger or busier blocks spread it thinner, and a prover that stays warm pays it once."),
     ("Proving falls with prover research.","FlashProve is a research prototype. Every speedup in the prover, and every second provable model, cuts the red slice directly.")]
for i,(h,s) in enumerate(pts):
    x=0.05+i*0.31
    fig.text(x,0.45,h,fontsize=17,fontweight="bold",color=teal,wrap=True)
    t=fig.text(x,0.41,s,fontsize=14,color=tx,va="top",wrap=True); t._get_wrap_line_width=lambda w=0.28*1600: w
foot(fig,"Modeled, packages/economics, fast-screen configuration from slide 2 (atomized, 49% dedupe, screen settles 50% of atoms and 70% of fidelity checks, assumed).\nFidelity check $0.0033 each, from the measured live run. Epoch AI: LLM inference prices at fixed performance, about 40x per year (median trend). Projection is modeled.")
fig.savefig("slides/4-where-cost-sits.png",facecolor=bg); plt.close(fig)
print(pc, tot)

# ---------- 5. CommitLLM vs FlashProve
fig=frame("CommitLLM checks the answer for about 13% extra, not 70x.",
 "Two ways to show which model wrote a juror's answer. CommitLLM (Lambda Class, CCSD UBA) commits, then audits.")
ax=fig.add_axes([0.14,0.52,0.33,0.28]); style(ax)
vals=[82.5,1.13]; b=ax.barh([1,0],vals,color=[red,teal],height=0.55); ax.set_xscale("log"); ax.set_xlim(0.8,2000)
ax.set_yticks([1,0]); ax.set_yticklabels(["FlashProve","CommitLLM"],fontsize=16,color=tx); ax.set_xticks([])
ax.text(82.5*1.15,1,"70 to 95x",va="center",fontsize=22,fontweight="bold",color="#fff")
ax.text(1.13*1.15,0,"1.12 to 1.14x",va="center",fontsize=22,fontweight="bold",color="#fff")
ax.set_title("GPU cost of proof, as a multiple of running the model",loc="left",fontsize=16,color=tx,pad=10)
ax2=fig.add_axes([0.62,0.52,0.33,0.28]); style(ax2)
b=ax2.barh([1,0],[17000,1.3],color=[red,teal],height=0.55); ax2.set_xscale("log"); ax2.set_xlim(0.5,4e6)
ax2.set_yticks([1,0]); ax2.set_yticklabels(["FlashProve","CommitLLM"],fontsize=16,color=tx); ax2.set_xticks([])
ax2.text(17000*1.2,1,"17 s per proof",va="center",fontsize=22,fontweight="bold",color="#fff")
ax2.text(1.3*1.2,0,"1.3 ms per audited token",va="center",fontsize=22,fontweight="bold",color="#fff")
ax2.set_title("CPU time to verify, log scale",loc="left",fontsize=16,color=tx,pad=10)
rows=[("","FlashProve","CommitLLM"),
 ("What you get","A zkSNARK: math proof of the whole run","Commit, then audit: algebraic checks on big matrix layers, replay, sampled KV"),
 ("Size per answer","18.78 MB","\"compact\" receipt, size not published"),
 ("Context","1,024 tokens, so Verafy must pack","Limit not published; serves on the normal GPU path"),
 ("Models","Llama 4 Maverick only","Dense open-weight decoders; measured on Qwen2.5-7B, Llama-3.1-8B"),
 ("Open gap","Speed and memory","Attention after token 0 needs a kernel-aligned witness; audits are sampled")]
y0=0.42
for i,r in enumerate(rows):
    y=y0-i*0.045
    for j,(x,w) in enumerate([(0.06,0.13),(0.2,0.3),(0.51,0.45)]):
        fig.text(x,y,r[j],fontsize=13.5 if i else 13,color=(mu if j==0 or i==0 else (red if j==1 else teal)) if i==0 else (mu if j==0 else tx),fontweight="bold" if i==0 else "normal")
    if i: fig.lines.append(plt.Line2D([0.06,0.96],[y+0.03,y+0.03],transform=fig.transFigure,color=bd,lw=1))
fig.text(0.06,0.135,"For Verafy (modeled): the measured $0.0033 ruling plus 14% is about $0.0038, each juror audited on its own model.",fontsize=15,color=teal)
foot(fig,"Vendor-reported. CommitLLM: commitllm.com, read Nov 17, 2026 (verifier timing on Llama 70B, CPU only; online tracing overhead +12 to 14%). FlashProve: README and figures.txt, commit 9e2bdd8.\nNeither is reproduced by Verafy. CommitLLM is not a SNARK or a TEE; its own page lists attention at later positions as open.")
fig.savefig("slides/5-commitllm-vs-flashprove.png",facecolor=bg); plt.close(fig)
