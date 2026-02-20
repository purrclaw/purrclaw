import React from "react";
import { useShow } from "@refinedev/core";
import {
  useTable,
  List,
  DeleteButton,
  DateField,
  Show,
  ShowButton,
  Edit,
  Create,
  EditButton,
  CreateButton,
  useForm,
} from "@refinedev/antd";
import { Table, Space, Typography, Descriptions, Input, Form } from "antd";

const { Text, Paragraph } = Typography;

export function SessionsList() {
  const [search, setSearch] = React.useState("");
  const { tableProps, setFilters } = useTable({
    resource: "sessions",
    sorters: { initial: [{ field: "updated_at", order: "desc" }] },
    syncWithLocation: true,
  });

  React.useEffect(() => {
    const next = search.trim() ? [{ field: "q", operator: "eq", value: search.trim() }] : [];
    setFilters(next, "replace");
  }, [search, setFilters]);

  return (
    <List
      headerButtons={
        <Space>
          <Input.Search allowClear placeholder="Search session key or summary" onSearch={setSearch} style={{ width: 300 }} />
          <CreateButton />
        </Space>
      }
    >
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column
          dataIndex="session_key"
          title="Session Key"
          render={(v) => <Text code style={{ fontSize: 12 }}>{v}</Text>}
        />
        <Table.Column
          dataIndex="summary"
          title="Summary"
          render={(v) => (
            <Text type={v ? undefined : "secondary"} ellipsis={{ tooltip: v }} style={{ maxWidth: 340 }}>
              {v || "no summary"}
            </Text>
          )}
        />
        <Table.Column dataIndex="message_count" title="Messages" width={90} sorter />
        <Table.Column dataIndex="last_message_at" title="Last Message" width={150} sorter render={(v) => (v ? <DateField value={v} /> : <Text type="secondary">—</Text>)} />
        <Table.Column dataIndex="created_at" title="Created" width={150} sorter render={(v) => <DateField value={v} />} />
        <Table.Column dataIndex="updated_at" title="Updated" width={150} sorter render={(v) => <DateField value={v} />} />
        <Table.Column
          title="Actions"
          width={130}
          render={(_, r) => (
            <Space>
              <ShowButton hideText size="small" recordItemId={r.id} />
              <EditButton hideText size="small" recordItemId={r.id} />
              <DeleteButton hideText size="small" recordItemId={r.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}

export function SessionsCreate() {
  const { formProps, saveButtonProps } = useForm({ resource: "sessions", redirect: "list" });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Session Key" name="session_key" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Summary" name="summary">
          <Input.TextArea rows={5} />
        </Form.Item>
      </Form>
    </Create>
  );
}

export function SessionsEdit() {
  const { formProps, saveButtonProps, query } = useForm({ resource: "sessions", redirect: "list" });

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Session Key">
          <Input value={query?.data?.data?.session_key} disabled />
        </Form.Item>
        <Form.Item label="Summary" name="summary">
          <Input.TextArea rows={6} />
        </Form.Item>
      </Form>
    </Edit>
  );
}

export function SessionsShow() {
  const { query } = useShow({ resource: "sessions" });
  const record = query?.data?.data;

  return (
    <Show isLoading={query?.isLoading}>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="Session Key">
          <Text code>{record?.session_key}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Summary">
          <Paragraph style={{ marginBottom: 0 }}>{record?.summary || "—"}</Paragraph>
        </Descriptions.Item>
        <Descriptions.Item label="Messages">{record?.message_count ?? 0}</Descriptions.Item>
        <Descriptions.Item label="Last Message">{record?.last_message_at ? <DateField value={record.last_message_at} /> : "—"}</Descriptions.Item>
        <Descriptions.Item label="Created">
          <DateField value={record?.created_at} />
        </Descriptions.Item>
        <Descriptions.Item label="Updated">
          <DateField value={record?.updated_at} />
        </Descriptions.Item>
      </Descriptions>
    </Show>
  );
}
