{{- define "trucker-mobile.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "trucker-mobile.fullname" -}}
{{- if contains (include "trucker-mobile.name" .) .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "trucker-mobile.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "trucker-mobile.labels" -}}
app.kubernetes.io/name: {{ include "trucker-mobile.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "trucker-mobile.selectorLabels" -}}
app.kubernetes.io/name: {{ include "trucker-mobile.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}