'use client';
import { Alert, Card, Checkbox, Col, DatePicker, Form, FormInstance, Input, InputNumber, Row, Select, Switch } from 'antd';
import dayjs from 'dayjs';
import { SOURCES } from '@/lib/format';
import OfferSelect from './OfferSelect';

// Device safety screening for non-surgical body contouring (EMS, RF, cryolipolysis, HIFU).
export const SCREENING = [
  'Pregnant or breastfeeding', 'Pacemaker / implanted electronic device', 'Metal implants in treatment area', 'Epilepsy',
  'Active cancer / under oncology treatment', 'Surgery in last 6 months', 'Cold urticaria / Raynaud’s', 'Hernia in treatment area',
];
const NATIONALITIES = ['UAE', 'Saudi Arabia', 'Egypt', 'Jordan', 'Lebanon', 'Syria', 'India', 'Pakistan', 'Philippines', 'UK', 'Russia', 'Germany', 'Italy', 'France', 'USA', 'Other'];

const Section = ({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) => (
  <Card size="small" style={{ marginBottom: 16 }} title={<span className="section-title" style={{ margin: 0 }}>{title}</span>} extra={extra}>{children}</Card>
);

/** Turns a stored client into form values and back. Screening ticks are kept in `contraindications` as "; "-separated text. */
export const toForm = (c: any) => ({
  ...c, dob: c.dob ? dayjs(c.dob) : undefined,
  screening: SCREENING.filter((s) => c.contraindications?.includes(s)),
  contraindicationsOther: c.contraindications?.split('; ').filter((s: string) => !SCREENING.includes(s)).join('; ') || undefined,
});
export const fromForm = (v: any) => {
  const { screening = [], contraindicationsOther, dob, ...rest } = v;
  const contra = [...screening, ...(contraindicationsOther ? [contraindicationsOther] : [])].join('; ');
  return { ...rest, dob: dob ? dob.toISOString() : null, contraindications: contra || null };
};

export default function ClientForm({ form, onFinish, initialValues }: { form: FormInstance; onFinish: (v: any) => void; initialValues?: any }) {
  const dob = Form.useWatch('dob', form);
  const screening: string[] = Form.useWatch('screening', form) ?? [];
  const photoConsent = Form.useWatch('photoConsent', form);
  return (
    <Form form={form} layout="vertical" onFinish={onFinish} requiredMark initialValues={{ reviewIntervalDays: 15, whatsappOptIn: true, consentSigned: false, ...initialValues }} scrollToFirstError>
      <Section title="Client details">
        <Row gutter={16}>
          <Col xs={12} md={4}><Form.Item name="vip" valuePropName="checked" label="VIP client"><Switch /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="source" label="How did they hear about us?"><Select allowClear placeholder="Select source" options={SOURCES.map((value) => ({ value }))} /></Form.Item></Col>
          <Col xs={24} md={6}><Form.Item name="referredBy" label="Referred by"><Input placeholder="Client or partner name" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="offer" label="Marketing offer selected"><OfferSelect /></Form.Item></Col>
        </Row>
      </Section>
      <Section title="Basic information">
        <Row gutter={16}>
          <Col xs={8} md={3}><Form.Item name="title" label="Title"><Select allowClear placeholder="Title" options={['Ms.', 'Mrs.', 'Mr.', 'Dr.'].map((value) => ({ value }))} /></Form.Item></Col>
          <Col xs={16} md={7}><Form.Item name="firstName" label="First name" rules={[{ required: true, whitespace: true, message: 'Enter first name' }]}><Input placeholder="Enter first name" /></Form.Item></Col>
          <Col xs={12} md={7}><Form.Item name="middleName" label="Middle name"><Input placeholder="Enter middle name" /></Form.Item></Col>
          <Col xs={12} md={7}><Form.Item name="lastName" label="Last name" rules={[{ required: true, whitespace: true, message: 'Enter last name' }]}><Input placeholder="Enter last name" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="mobile" label="Mobile" rules={[{ required: true, message: 'Mobile is required' }, { pattern: /^[+0-9 ]{7,16}$/, message: 'Digits only, e.g. 0501234567' }]}><Input placeholder="05X XXX XXXX" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="altPhone" label="Additional phone"><Input placeholder="+971" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Not a valid email' }]}><Input placeholder="name@example.com" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="dob" label="Date of birth" extra={dob ? `Age ${dayjs().diff(dob, 'year')} years` : undefined}><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" disabledDate={(d) => d.isAfter(dayjs())} /></Form.Item></Col>
          <Col xs={12} md={4}><Form.Item name="gender" label="Gender" rules={[{ required: true, message: 'Select gender' }]}><Select placeholder="Select" options={[{ value: 'Female' }, { value: 'Male' }]} /></Form.Item></Col>
          <Col xs={12} md={4}><Form.Item name="nationality" label="Nationality"><Select allowClear showSearch={{ optionFilterProp: 'value' }} placeholder="Select" options={NATIONALITIES.map((value) => ({ value }))} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="emiratesId" label="Emirates ID / Passport" rules={[{ pattern: /^[A-Z0-9-]{6,20}$/i, message: 'e.g. 784-1990-1234567-1' }]}><Input placeholder="784-XXXX-XXXXXXX-X" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="occupation" label="Occupation"><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="address" label="Address"><Input placeholder="Area, city" /></Form.Item></Col>
        </Row>
      </Section>
      <Section title="Emergency contact (next of kin)">
        <Row gutter={16}>
          <Col xs={24} md={8}><Form.Item name="emergencyName" label="Name"><Input /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="emergencyRelation" label="Relation"><Select allowClear options={['Spouse', 'Mother', 'Father', 'Sister', 'Brother', 'Friend', 'Other'].map((value) => ({ value }))} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="emergencyPhone" label="Phone"><Input placeholder="+971" /></Form.Item></Col>
        </Row>
      </Section>
      <Section title="Health screening">
        <Form.Item name="screening" label="Safety screening — tick anything that applies">
          <Checkbox.Group style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6 }} options={SCREENING} />
        </Form.Item>
        {screening.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title="Contraindication flagged" description={`${screening.join(', ')} — the consultant must clear the client before device treatments.`} />}
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="conditions" label="Medical conditions"><Input.TextArea rows={2} placeholder="e.g. hypothyroidism, PCOS, diabetes" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="medications" label="Current medications"><Input.TextArea rows={2} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="allergies" label="Allergies"><Input placeholder="None known" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="contraindicationsOther" label="Other contraindications / restrictions"><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="goal" label="Client goal"><Input placeholder="e.g. Reduce abdominal fat before wedding in March" /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="targetWeightKg" label="Target weight (kg)"><InputNumber min={30} max={250} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="reviewIntervalDays" label="Doctor review every" rules={[{ required: true }]}><InputNumber min={1} max={365} suffix="days" style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={24}><Form.Item name="medicalNotes" label="Screening notes"><Input.TextArea rows={2} /></Form.Item></Col>
        </Row>
      </Section>
      <Section title="Consent & communication preferences">
        <Row gutter={16}>
          <Col xs={12} md={6}><Form.Item name="consentSigned" valuePropName="checked" label="Treatment consent signed"><Switch /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="photoConsent" valuePropName="checked" label="Before/after photo consent" extra={photoConsent === false ? 'Photos cannot be uploaded' : undefined}><Switch /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="whatsappOptIn" valuePropName="checked" label="WhatsApp reminders"><Switch /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="marketingOptIn" valuePropName="checked" label="Marketing offers"><Switch /></Form.Item></Col>
        </Row>
      </Section>
    </Form>
  );
}
