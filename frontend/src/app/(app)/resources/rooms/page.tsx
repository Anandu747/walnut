'use client';
import { useState } from 'react';
import { App, Button, Card, Col, Input, Modal, Row, Switch, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { PageHeader } from '@/components/ui';

export default function RoomsPage() {
  const { message } = App.useApp();
  const { data = [], reload } = useApi<any[]>('/rooms', []);
  const [name, setName] = useState<string | null>(null);
  const toggle = async (r: any, active: boolean) => { try { await api(`/rooms/${r.id}`, { method: 'PATCH', body: { active } }); reload(); } catch (e) { message.error((e as Error).message); } };
  const add = async () => { try { await api('/rooms', { method: 'POST', body: { name } }); setName(null); reload(); } catch (e) { message.error((e as Error).message); } };
  return (
    <>
      <PageHeader crumb="Resources" title="Treatment Rooms" sub="A room can hold one treatment at a time; machines have a home room that the booking engine prefers"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setName('')}>Add room</Button>} />
      <Row gutter={[16, 16]}>
        {data.map((r) => (
          <Col xs={24} md={12} xl={6} key={r.id}>
            <Card title={r.name} size="small" extra={<Switch checked={r.active} onChange={(v) => toggle(r, v)} checkedChildren="In use" unCheckedChildren="Closed" />} style={{ opacity: r.active ? 1 : 0.6 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Equipment based here</div>
              {r.machines.length ? r.machines.map((m: any) => <Tag key={m.code} color="blue">{m.code}</Tag>) : <span className="muted">No fixed machines (manual treatments / consultations)</span>}
            </Card>
          </Col>
        ))}
      </Row>
      <Modal open={name !== null} onCancel={() => setName(null)} title="Add room" onOk={add} okButtonProps={{ disabled: !name }}>
        <Input placeholder="e.g. Room 5" value={name ?? ''} onChange={(e) => setName(e.target.value)} />
      </Modal>
    </>
  );
}
