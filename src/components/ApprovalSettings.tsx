export function ApprovalSettings({ value, setValue, zh }: any) {
  return (
    <section
      className="approval-settings"
      aria-label={zh ? '\u5e2e\u6211\u5ba1\u6279' : 'Approve for me'}
    >
      <h3>{zh ? '帮我审批' : 'Approve for me'}</h3>
      <div className="form-grid">
        <label>
          {zh ? '独立审核连接' : 'Separate reviewer connection'}
          <select
            value={value.autoReview?.profileId || ''}
            onChange={(e) =>
              setValue({ ...value, autoReview: { ...value.autoReview, profileId: e.target.value } })
            }
          >
            <option value="">
              {zh
                ? '使用当前对话模型，独立审核上下文'
                : 'Conversation model, separate review context'}
            </option>
            {value.profiles.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        {zh
          ? '在对话权限里选择「帮我审批」启用。风险或不确定操作转人工；审核失败也转人工。不会更改沙箱，不保证识别全部风险。审核调用会额外计费。'
          : 'Enable “Approve for me” in conversation permissions. Risky, uncertain, or failed reviews go to you. The sandbox does not change; detection is not guaranteed. Review requests are billed separately.'}
      </p>
      <p className="muted">
        {zh
          ? '同一对话模型可使用已读代码，并只读检查命令引用的项目脚本（最多 3 个，每个 8 KB）。源码不发送到另选的审核连接；越界、缺失或不完整的资料不会被视为安全证明。'
          : 'The same conversation model may use observed code and inspect up to three command-referenced project scripts (8 KB each). Source is not forwarded to a separately selected reviewer. Missing or partial evidence is not a safety proof.'}
      </p>
    </section>
  );
}
