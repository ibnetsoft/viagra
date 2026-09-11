export default function Loading() {
  return (
    <div className="member-stage">
      <div className="member-frame" style={{ padding: 24 }}>
        <div role="status" aria-live="polite" className="member-card">
          <strong>화면을 불러오고 있어요</strong>
          <p className="member-explanation">잠시만 기다려 주세요.</p>
        </div>
      </div>
    </div>
  );
}
