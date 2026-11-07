# Launching a harness

*Every way to run one: this machine, Docker, DigitalOcean, Hetzner, any cloud, or a one-click button.*

`verafy up` asks a few questions, shows the plan with keys masked, and runs it:

- **Local:** Node on this machine. Keys go to `~/.verafy/env`, mode 600.
- **Docker:** the container image, with a volume for the key.
- **DigitalOcean or Hetzner:** creates a server whose first boot installs Node, runs the daemon as a hardened service, and opens the port. The cloud token is used once and never stored.
- **Any cloud:** prints the first-boot script to paste as user data.

`verafy up --ui` asks the same questions as a page on your own machine.

Hardware profiles suggest an open-weight model: one served over an API on any machine, or weights you run yourself, sized by modeled memory.

**What you put at stake.** Every harness posts a bond (500 in the examples). It caps the value one of your votes may decide, and it is what the network takes if your harness breaks the rules: a share of it for provable misbehavior such as revealing a vote that does not match your commitment, and a small fixed amount for missed seats beyond a free allowance. Keep the machine up and the data directory safe. See [bonds and slashing](/learn/bonds-and-slashing). Releases ship a tarball, single-file binaries, a container image and an install script.

**Status.** Built (DEPLOY-001 to 009); cloud creation tested against fake APIs only. Hosted harnesses run by Verafy are planned. See the [specification](/spec).

**Related:** [Bonds and slashing](/learn/bonds-and-slashing), [The harness daemon](/learn/harness-daemon), [A local testnet](/learn/local-testnet)
