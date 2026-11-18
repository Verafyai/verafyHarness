exec(open("slides.py").read().split("# ---------- 1.")[0])
from PIL import Image
A="/home/claude/verafyharness/docs/proposals/assets/VIP-0045/"
def shot(fig,f,x,y,w,cap=None,sub=None,crop=None,capabove=False):
    im=Image.open(A+f)
    if crop: im=im.crop(crop)
    h=w*im.size[1]/im.size[0]*16/9
    ax=fig.add_axes([x,y,w,h]); ax.imshow(im); ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values(): s.set_color(bd)
    cy=y+h+0.045 if capabove else y-0.035
    if cap: fig.text(x,cy,cap,fontsize=16,fontweight="bold",color=teal)
    if sub: fig.text(x+(0.0 if not capabove else 0.0),cy-0.03 if not capabove else cy-0.028,sub,fontsize=13,color=mu)
    return h
# 8
fig=frame("Verafy Studio: design an Actually Smart Contract by wiring it.",
 "A visual designer for judgment flows. Pick a template, set the jury, run it, read the ruling. Preview, mock data.")
shot(fig,"01-studio-a2a-contract.jpg",0.05,0.14,0.6)
pts=[("Contracts in plain language","The intention is stored, not code. A compiler step turns it into questions a jury can rule on."),
     ("Prompt Guard by default","Every flow passes through the guard before a juror reads anything."),
     ("The jury is a parameter","Jurors, approvals, model levels, budget, rules and goals are set per contract."),
     ("Rulings you can audit","Votes, decision tree, sources, dissent, cost and signature come back with every ruling.")]
for i,(h,s) in enumerate(pts):
    y=0.74-i*0.15
    fig.text(0.68,y,h,fontsize=17,fontweight="bold",color=teal)
    t=fig.text(0.68,y-0.03,s,fontsize=13.5,color=tx,va="top",wrap=True); t._get_wrap_line_width=lambda: 0.28*1600
foot(fig,"Agent-to-agent bonded contract: two agents post bonds, payment sits in escrow, a jury rules on delivery, and the outcome releases, splits or refunds and slashes.\nVerafy Studio prototype, VIP-0045 in the Verafy Harness repo. Runs on mock data; rulings shown are not live.")
fig.savefig("slides/8-studio.png",facecolor=bg); plt.close(fig)
# 9
fig=frame("Templates for contracts code can't write.",
 "Each starts as a preset and can be customized. Twelve ship in the preview; four shown here.")
g=[("11-squads-spending-policy.jpg","Squads spending policy","An AI jury as a multisig signer with a policy"),
   ("10-dao-constitution.jpg","DAO constitution","Every proposal checked against the constitution"),
   ("19-prediction-market.jpg","Prediction market","Resolved by a jury, with search allowed"),
   ("14-security-certification.jpg","Security certification","Fuzzy attacks a program; a jury certifies the run")]
for i,(f,c,s) in enumerate(g):
    shot(fig,f,0.05+(i%2)*0.47,0.42-(i//2)*0.395,0.31,c,s,crop=(268,64,1680,900),capabove=True)
    # caption to right of image
fig.savefig("slides/9-studio-templates.png",facecolor=bg); plt.close(fig)
# 10
fig=frame("Set the jury. Read the ruling.",
 "The jury call is a node with parameters. The ruling comes back with every vote, its reasoning, its sources and its cost.")
shot(fig,"02-jury-call-parameters.jpg",0.05,0.22,0.44,crop=(268,64,1680,900),cap="Jury call parameters",sub="Jurors and approvals, model levels, budget, guardrails, scoring")
shot(fig,"06-run-and-ruling.jpg",0.51,0.22,0.44,crop=(268,64,1680,900),cap="Run and ruling",sub="Votes, decision tree, sources, dissent, cost, signature")
fig.savefig("slides/10-studio-jury-ruling.png",facecolor=bg); plt.close(fig)
