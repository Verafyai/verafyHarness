exec(open("slides.py").read().split("# ---------- 1.")[0])
from matplotlib.patches import FancyArrowPatch
fig=frame("What packing is: many small questions, one proof.",
 "A proof is priced per 1,024-token request, not per question. Packing fills every request and proves it once.")
ax=fig.add_axes([0.04,0.42,0.92,0.42]); ax.set_xlim(0,100); ax.set_ylim(0,50); ax.axis("off")
cols=[(0,"60 contracts","Plain-language contracts\nin a block",mu),(25.5,"120 atoms","Atomize: one closed\nquestion per atom,\nonly the deciding facts",amber),
      (51,"61 unique","Dedupe: the same question\non the same evidence\nis asked once",teal),(76.5,"4 proofs","Pack about 16 atoms per\nrequest, 85% full,\nproven once",teal)]
for x,big,sub,c in cols:
    ax.add_patch(Rectangle((x,0),23.5,50,fc=sf,ec=c,lw=2))
    ax.text(x+1.5,44,big,fontsize=30,fontweight="bold",color=c,va="top")
    ax.text(x+1.5,33,sub,fontsize=14,color=tx,va="top",linespacing=1.45)
    if x<76:
        ax.add_patch(FancyArrowPatch((x+23.6,25),(x+25.4,25),arrowstyle="-|>",mutation_scale=18,color=mu,lw=1.6))
# mini atoms drawing
import random; random.seed(3)
for x,n,c in [(25.5,24,amber),(51,12,teal)]:
    for i in range(n):
        ax.add_patch(Rectangle((x+1.5+(i%8)*2.6,3+(i//8)*3.2),2.1,2.4,fc=c,alpha=.85,lw=0))
for j in range(4):
    ax.add_patch(Rectangle((78+j*5.3,3),4.5,10,fc=sf,ec=teal,lw=1.5))
    ax.add_patch(Rectangle((78+j*5.3,3),4.5,8.5 if j<3 else 6,fc=teal,alpha=.6,lw=0))
for i in range(6):
    ax.add_patch(Rectangle((1.5+(i%3)*7,3+(i//3)*6),6,4.6,fc=mu,alpha=.5,lw=0))
pts=[("Why it may be the answer","Proving costs the same whether a request carries one question or sixteen. Per 1,000 contracts: 5,000 proofs unpacked, 125 packed and proven once, 64 after dedupe."),
     ("What keeps it honest","Code, not a model, turns atom answers into the outcome. UNKNOWN goes to the contract's fallback. A reply that mangles any slot is rejected whole."),
     ("What it costs","A proof covers the atoms, not whether they capture the contract, so each plan is checked by a panel first. After packing, those checks cost more than the proofs.")]
for i,(h,s) in enumerate(pts):
    x=0.05+i*0.31
    fig.text(x,0.35,h,fontsize=17,fontweight="bold",color=teal)
    t=fig.text(x,0.315,s,fontsize=13.5,color=tx,va="top",wrap=True); t._get_wrap_line_width=lambda: 0.285*1600
foot(fig,"Measured: one test block on the Verafy packer, 60 contracts to 120 atoms, 61 after dedupe, 4 requests at 85% fill (mock models, no real prover attached). Proof counts: modeled, packages/economics.\nFlashProve limit of 1,024 tokens per proven request: vendor-reported.")
fig.savefig("slides/2a-what-packing-is.png",facecolor=bg); plt.close(fig)
