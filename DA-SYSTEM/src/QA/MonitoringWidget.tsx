type MonitoringWidgetProps = {
  count: number;
  onClick: () => void;
};

function MonitoringWidget({ count, onClick }: MonitoringWidgetProps) {
  return (
    <button type="button" onClick={onClick} style={launcherStyle}>
      <div style={iconBubbleStyle}>!</div>
      <div style={textWrapStyle}>
        <div style={titleStyle}>Monitoring</div>
        <div style={subtitleStyle}>
          {count} active item{count === 1 ? '' : 's'}
        </div>
      </div>
      {count > 0 ? <div style={badgeStyle}>{count}</div> : null}
    </button>
  );
}

const launcherStyle = {
  position: 'fixed' as const,
  right: '24px',
  bottom: '24px',
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minWidth: '210px',
  padding: '14px 16px',
  borderRadius: '18px',
  border: '1px solid rgba(96,165,250,0.22)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.94) 0%, rgba(15,23,42,0.82) 100%)',
  color: '#f8fafc',
  boxShadow: '0 18px 48px rgba(2,6,23,0.42)',
  backdropFilter: 'blur(18px)',
  cursor: 'pointer',
};

const iconBubbleStyle = {
  width: '40px',
  height: '40px',
  borderRadius: '999px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  fontWeight: 900,
  fontSize: '18px',
  color: '#fff',
  flexShrink: 0,
};

const textWrapStyle = {
  display: 'grid',
  gap: '4px',
  textAlign: 'left' as const,
};

const titleStyle = {
  fontWeight: 800,
  fontSize: '15px',
  color: '#f8fafc',
};

const subtitleStyle = {
  fontSize: '12px',
  color: '#94a3b8',
};

const badgeStyle = {
  minWidth: '28px',
  height: '28px',
  padding: '0 8px',
  borderRadius: '999px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#ef4444',
  color: '#fff',
  fontSize: '12px',
  fontWeight: 800,
  flexShrink: 0,
};

export default MonitoringWidget;
