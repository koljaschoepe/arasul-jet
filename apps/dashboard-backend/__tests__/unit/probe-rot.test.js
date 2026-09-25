// PROBE (J35, ci-summary-wartet-auf-alle-jobs): absichtlich rot. Dieser PR darf
// trotz Auto-Merge nie gemergt werden und wird ohne Merge geschlossen.
describe('Probe', () => {
  it('ist absichtlich rot', () => {
    expect(1).toBe(2);
  });
});
