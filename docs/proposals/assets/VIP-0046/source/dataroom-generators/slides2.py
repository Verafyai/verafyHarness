exec(open("slides.py").read().split("# ---------- 1.")[0])
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import sys; sys.path.insert(0,".")
# ---------- 6. routing diagram
fig=frame("How Verafy is cutting the cost of provable inference.",
 "Decision models route decision models: each query goes to the cheapest tier that can answer it safely.")
ax=fig.add_axes([0.03,0.14,0.94,0.7]); ax.set_xlim(0,100); ax.set_ylim(-2,62); ax.axis("off")
def box(x,y,w,h,title,sub,c,status=None):
    ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle="square,pad=0",fc=sf,ec=c,lw=2))
    ax.text(x+1.2,y+h-1.8,title,fontsize=15,fontweight="bold",color=c,va="top")
    ax.text(x+1.2,y+h-5.4,sub,fontsize=12,color=tx,va="top",linespacing=1.45)
    if status: ax.text(x+w-1,y+h-2.6,status,fontsize=10.5,color=mu,ha="right",va="top")
def arr(x1,y1,x2,y2,c=mu): ax.add_patch(FancyArrowPatch((x1,y1),(x2,y2),arrowstyle="-|>",mutation_scale=18,color=c,lw=1.8))
box(0,22,15,16,"Query","A contract, a claim,\nor an agent's dispute",mu)
box(19,22,15,16,"Prompt Guard","No juror reads a\nnaked prompt",mu,"built")
box(38,16,19,28,"Decision model","A fast System 1 model\nreads each query, scores\nit and checks precedent.\nPlain-code rules route;\na contract's floor is\nnever lowered.",teal,"router built")
arr(15,30,19,30); arr(34,30,38,30)
rows=[(49,"Precedent cache","Cached judgment answers it.\nNo new ruling, no new code.",teal,"designed, VIP-0042"),
      (36.5,"Fast screen settles","Easy, low-stakes questions,\nonly where the contract allows.",teal,"built, shadow mode"),
      (24,"Small, then mid panels","Unanimous stops. A split\nescalates to a bigger panel.",amber,"built"),
      (11.5,"Frontier jury","Only the hard cases: 3 to 10\njurors across model families.",red,"built"),
      (-1,"Proven lane","Pack 16 questions per proof,\nprove once: receipt or zkSNARK.",vio,"packing built, mock prover")]
for y,t,s,c,st in rows:
    box(63,y+0.3,37,11.4,t,s,c,st); arr(57,30,63,y+6,c)
foot(fig,"Status from the Verafy Harness spec (docs/spec/VERAFY-SPEC.md): ROUTE-001 to 006 built as a library, ROUTE-007 calibration needs Jev access, PACK-011 wired with a mock prover, precedent designed in VIP-0042.\nProof options: CommitLLM receipts (about 13% overhead, vendor-reported) for routine rulings, FlashProve zkSNARK (70 to 95x, vendor-reported) when stakes justify it.")
fig.savefig("slides/6-routing.png",facecolor=bg); plt.close(fig)

# ---------- 7. funnel
tiers=[("Precedent cache",0.0004,0.3,0.40),("Fast screen",0.0004,0.3,0.18),("Small panel",0.0010,2,0.21),("Mid panel",0.0033,10,0.12),("Frontier jury",0.0300,35,0.09)]
reach=1; avg=0; cum=0; cs=0; avgs=0; rows=[]
for n,u,s,st in tiers:
    avg+=reach*u; cs+=s; avgs+=st*cs; rows.append((n,reach,st)); reach-=st
base=0.03
fig=frame("Only the hard problems ever reach a jury.",
 "A decision model checks precedent first. Of 1,000 queries, 90 reach the frontier jury.")
ax=fig.add_axes([0.05,0.2,0.56,0.62]); ax.set_xlim(0,1000); ax.set_ylim(-0.6,4.6); ax.axis("off")
cols=[teal,teal,amber,amber,red]
for k,((n,r,st),c) in enumerate(zip(rows,cols)):
    y=4-k; w=r*620
    ax.add_patch(Rectangle((0,y-0.38),w,0.76,fc=c,ec=bg))
    ax.text(12,y,f"{round(r*1000):,}",va="center",fontsize=20,fontweight="bold",color=bg)
    ax.text(w+14,y+0.13,n,va="center",fontsize=16,fontweight="bold",color=tx)
    ax.text(w+14,y-0.2,f"settles {round(st*1000):,}",va="center",fontsize=13,color=mu)
x=0.64
stats=[(f"${avg:.4f}","average per query (modeled)",f"vs ${base:.2f} with every query sent to a jury: {base/avg:.0f}x cheaper"),
       (f"{avgs:.1f} s","average time to an answer",f"vs 35 s for a jury; 58% are answered in under a second"),
       ("9%","reach the full jury","the only cases paying for a full panel")]
for i,(b,a,s) in enumerate(stats):
    y=0.72-i*0.21
    fig.text(x,y,b,fontsize=40,fontweight="bold",color=teal)
    fig.text(x,y-0.04,a,fontsize=16,color=tx); fig.text(x,y-0.075,s,fontsize=12.5,color=mu)
foot(fig,"Illustrative. Tier shares are assumptions, not measurements: no precedent hit rate or screen coverage has been measured yet (VIP-0042, ROUTE-007). Tier costs and times from packages/economics CASCADE_EXAMPLE:\nscreen $0.0004 and 0.3 s (Jev, vendor-reported), small $0.0010, mid $0.0033 (measured live run), frontier $0.03. A cache read is priced as one screen call. Every escalated query also pays the tiers below it.")
fig.savefig("slides/7-funnel.png",facecolor=bg); plt.close(fig)
print(avg,avgs)
